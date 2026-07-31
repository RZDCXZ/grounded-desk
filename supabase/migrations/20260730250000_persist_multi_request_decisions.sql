alter table public.message_factual_requests
add column response_content text
check (
  response_content is null
  or char_length(btrim(response_content)) between 1 and 20000
),
add column response_status text
check (
  response_status is null
  or response_status in (
    'supported',
    'unsupported',
    'conflicting',
    'clarification',
    'handoff'
  )
);

create or replace function private.enforce_citation_grounded_answer()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages as message
    where message.id = new.message_id
      and message.organization_id = new.organization_id
      and message.conversation_id = new.conversation_id
      and message.status = 'completed'
      and (
        message.message_type in (
          'grounded_answer',
          'partially_grounded_answer',
          'knowledge_conflict'
        )
        or (
          new.factual_request_id is not null
          and message.message_type in (
            'clarification_request',
            'human_handoff'
          )
        )
      )
  ) then
    raise exception 'citations require a completed grounded answer'
      using errcode = '23514';
  end if;

  if
    new.factual_request_id is not null
    and not exists (
      select 1
      from public.message_factual_requests as factual_request
      where factual_request.id = new.factual_request_id
        and factual_request.organization_id = new.organization_id
        and factual_request.conversation_id = new.conversation_id
        and factual_request.assistant_message_id = new.message_id
        and factual_request.coverage_status in (
          'supported',
          'conflicting'
        )
    )
  then
    raise exception
      'citation factual request must belong to the same message'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function public.complete_public_multi_request_decision(
  assistant_public_id uuid,
  target_conversation_id uuid,
  result_type text,
  result_sections jsonb,
  multi_request_decision jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  decision_request jsonb;
  factual_request jsonb;
  coverage_decision jsonb;
  evidence_relationship jsonb;
  response_section jsonb;
  section_citation jsonb;
  v_completed_message_id uuid;
  v_organization_id uuid;
  v_human_contact_label text;
  v_human_contact_url text;
  v_visitor_message_id uuid;
  v_factual_request_id uuid;
  v_request_count integer;
  v_index integer;
  v_evidence_index integer;
  v_supported_count integer := 0;
  v_conflicting_count integer := 0;
  v_clarification_count integer := 0;
  v_handoff_count integer := 0;
  v_expected_result_type text;
  v_outcome text;
  v_status text;
begin
  select
    conversation.organization_id,
    assistant.human_contact_label,
    assistant.human_contact_url
  into
    v_organization_id,
    v_human_contact_label,
    v_human_contact_url
  from public.conversations as conversation
  join public.assistants as assistant
    on assistant.id = conversation.assistant_id
    and assistant.organization_id = conversation.organization_id
  where conversation.id = target_conversation_id
    and assistant.public_id = assistant_public_id;

  if v_organization_id is null then
    raise exception 'public conversation not found'
      using errcode = 'P0002';
  end if;

  if
    multi_request_decision is null
    or jsonb_typeof(multi_request_decision) <> 'object'
    or multi_request_decision - array[
      'version',
      'requestAnalysisVersion',
      'responseStrategyVersion',
      'resultType',
      'requests'
    ] <> '{}'::jsonb
    or not multi_request_decision ?& array[
      'version',
      'requestAnalysisVersion',
      'responseStrategyVersion',
      'resultType',
      'requests'
    ]
    or multi_request_decision ->> 'version'
      <> 'multi-request-decision-v1'
    or multi_request_decision ->> 'responseStrategyVersion'
      <> 'multi-request-response-v1'
    or jsonb_typeof(
      multi_request_decision -> 'requestAnalysisVersion'
    ) <> 'string'
    or char_length(btrim(
      multi_request_decision ->> 'requestAnalysisVersion'
    )) not between 1 and 120
    or jsonb_typeof(multi_request_decision -> 'requests') <> 'array'
    or jsonb_typeof(result_sections) <> 'array'
  then
    raise exception 'multi request decision structure is invalid'
      using errcode = '22023';
  end if;

  v_request_count :=
    jsonb_array_length(multi_request_decision -> 'requests');
  if
    v_request_count not between 2 and 3
    or jsonb_array_length(result_sections) <> v_request_count
    or multi_request_decision ->> 'resultType' <> result_type
    or result_type not in (
      'grounded_answer',
      'partially_grounded_answer',
      'knowledge_conflict',
      'grounded_refusal',
      'clarification_request',
      'human_handoff'
    )
  then
    raise exception 'multi request result identity is invalid'
      using errcode = '22023';
  end if;

  for v_index in 0..v_request_count - 1 loop
    decision_request :=
      multi_request_decision -> 'requests' -> v_index;
    response_section := result_sections -> v_index;

    if
      jsonb_typeof(decision_request) <> 'object'
      or decision_request - array[
        'factualRequest',
        'outcome',
        'coverage'
      ] <> '{}'::jsonb
      or not decision_request ?& array['factualRequest', 'outcome']
      or jsonb_typeof(response_section) <> 'object'
      or response_section - array[
        'id',
        'order',
        'title',
        'status',
        'content',
        'citations',
        'contact'
      ] <> '{}'::jsonb
      or not response_section ?& array[
        'id',
        'order',
        'status',
        'content',
        'citations'
      ]
    then
      raise exception 'multi request item structure is invalid'
        using errcode = '22023';
    end if;

    factual_request := decision_request -> 'factualRequest';
    v_outcome := decision_request ->> 'outcome';
    v_status := response_section ->> 'status';

    if
      jsonb_typeof(factual_request) <> 'object'
      or factual_request - array[
        'id',
        'order',
        'originalText',
        'normalizedQuestion',
        'completeness',
        'missingInformation',
        'clarificationRound'
      ] <> '{}'::jsonb
      or not factual_request ?& array[
        'id',
        'order',
        'originalText',
        'normalizedQuestion',
        'completeness',
        'missingInformation',
        'clarificationRound'
      ]
      or jsonb_typeof(factual_request -> 'id') <> 'string'
      or jsonb_typeof(factual_request -> 'order') <> 'number'
      or (factual_request ->> 'order')::numeric <> v_index + 1
      or jsonb_typeof(factual_request -> 'originalText') <> 'string'
      or char_length(btrim(factual_request ->> 'originalText'))
        not between 1 and 2000
      or jsonb_typeof(factual_request -> 'normalizedQuestion')
        <> 'string'
      or char_length(btrim(
        factual_request ->> 'normalizedQuestion'
      )) not between 1 and 2000
      or factual_request ->> 'completeness'
        not in ('complete', 'incomplete')
      or jsonb_typeof(factual_request -> 'missingInformation')
        <> 'array'
      or jsonb_array_length(
        factual_request -> 'missingInformation'
      ) > 10
      or jsonb_typeof(factual_request -> 'clarificationRound')
        <> 'number'
      or (factual_request ->> 'clarificationRound')::numeric
        not between 0 and 2
      or jsonb_typeof(response_section -> 'id') <> 'string'
      or response_section ->> 'id' <> factual_request ->> 'id'
      or jsonb_typeof(response_section -> 'order') <> 'number'
      or (response_section ->> 'order')::numeric <> v_index + 1
      or jsonb_typeof(response_section -> 'content') <> 'string'
      or char_length(btrim(response_section ->> 'content'))
        not between 1 and 20000
      or jsonb_typeof(response_section -> 'citations') <> 'array'
      or (
        response_section ? 'title'
        and (
          jsonb_typeof(response_section -> 'title') <> 'string'
          or char_length(btrim(response_section ->> 'title'))
            not between 1 and 2000
        )
      )
    then
      raise exception 'multi factual request or section is invalid'
        using errcode = '22023';
    end if;

    v_factual_request_id := (factual_request ->> 'id')::uuid;

    if factual_request ->> 'completeness' = 'complete' then
      if
        jsonb_array_length(
          factual_request -> 'missingInformation'
        ) <> 0
        or (factual_request ->> 'clarificationRound')::integer <> 0
        or v_outcome not in (
          'supported',
          'unsupported',
          'conflicting'
        )
        or not decision_request ? 'coverage'
        or v_status <> (
          case v_outcome
            when 'supported' then 'supported'
            when 'unsupported' then 'unsupported'
            else 'conflicting'
          end
        )
      then
        raise exception 'complete multi request outcome is invalid'
          using errcode = '22023';
      end if;

      coverage_decision := decision_request -> 'coverage';
      if
        jsonb_typeof(coverage_decision) <> 'object'
        or coverage_decision - array[
          'version',
          'factualRequestId',
          'status',
          'evidence'
        ] <> '{}'::jsonb
        or not coverage_decision ?& array[
          'version',
          'factualRequestId',
          'status',
          'evidence'
        ]
        or jsonb_typeof(coverage_decision -> 'version') <> 'string'
        or char_length(btrim(coverage_decision ->> 'version'))
          not between 1 and 120
        or coverage_decision ->> 'factualRequestId'
          <> factual_request ->> 'id'
        or coverage_decision ->> 'status' <> v_outcome
        or jsonb_typeof(coverage_decision -> 'evidence') <> 'array'
        or jsonb_array_length(coverage_decision -> 'evidence') > 10
        or (
          v_outcome = 'supported'
          and jsonb_array_length(
            coverage_decision -> 'evidence'
          ) = 0
        )
        or (
          v_outcome = 'unsupported'
          and jsonb_array_length(
            coverage_decision -> 'evidence'
          ) <> 0
        )
        or (
          v_outcome = 'conflicting'
          and jsonb_array_length(
            coverage_decision -> 'evidence'
          ) < 2
        )
      then
        raise exception 'multi coverage decision is invalid'
          using errcode = '22023';
      end if;

      if
        v_outcome = 'unsupported'
        and jsonb_array_length(
          response_section -> 'citations'
        ) <> 0
      then
        raise exception 'unsupported request cannot contain citations'
          using errcode = '22023';
      end if;

      v_evidence_index := 0;
      for evidence_relationship in
        select value
        from jsonb_array_elements(
          coverage_decision -> 'evidence'
        )
      loop
        if
          jsonb_typeof(evidence_relationship) <> 'object'
          or evidence_relationship - array[
            'contentUnitId',
            'knowledgeSourceId',
            'sourceTitle',
            'sourceUrl',
            'relationship',
            'exactExcerpt',
            'reason'
          ] <> '{}'::jsonb
          or not evidence_relationship ?& array[
            'contentUnitId',
            'knowledgeSourceId',
            'sourceTitle',
            'sourceUrl',
            'relationship',
            'exactExcerpt',
            'reason'
          ]
          or jsonb_typeof(
            evidence_relationship -> 'contentUnitId'
          ) <> 'string'
          or jsonb_typeof(
            evidence_relationship -> 'knowledgeSourceId'
          ) <> 'string'
          or jsonb_typeof(
            evidence_relationship -> 'sourceTitle'
          ) <> 'string'
          or jsonb_typeof(
            evidence_relationship -> 'sourceUrl'
          ) not in ('string', 'null')
          or evidence_relationship ->> 'relationship'
            <> (
              case v_outcome
                when 'conflicting' then 'conflicts'
                else 'supports'
              end
            )
          or jsonb_typeof(
            evidence_relationship -> 'exactExcerpt'
          ) <> 'string'
          or char_length(btrim(
            evidence_relationship ->> 'exactExcerpt'
          )) not between 1 and 2000
          or jsonb_typeof(evidence_relationship -> 'reason')
            <> 'string'
          or char_length(btrim(
            evidence_relationship ->> 'reason'
          )) not between 1 and 1000
        then
          raise exception 'multi evidence relationship is invalid'
            using errcode = '22023';
        end if;

        if not exists (
          select 1
          from public.content_units as content_unit
          join public.knowledge_sources as knowledge_source
            on knowledge_source.id =
              content_unit.knowledge_source_id
            and knowledge_source.organization_id =
              content_unit.organization_id
            and knowledge_source.current_revision_id =
              content_unit.knowledge_revision_id
            and knowledge_source.status = 'available'
            and knowledge_source.enabled
          where content_unit.id =
              (evidence_relationship ->> 'contentUnitId')::uuid
            and content_unit.organization_id = v_organization_id
            and content_unit.knowledge_source_id =
              (evidence_relationship ->> 'knowledgeSourceId')::uuid
            and knowledge_source.title =
              evidence_relationship ->> 'sourceTitle'
            and coalesce(
              to_jsonb(knowledge_source.original_url),
              'null'::jsonb
            ) is not distinct from
              (evidence_relationship -> 'sourceUrl')
            and position(
              btrim(pg_catalog.regexp_replace(
                normalize(
                  evidence_relationship ->> 'exactExcerpt',
                  NFKC
                ),
                '\s+',
                ' ',
                'g'
              ))
              in btrim(pg_catalog.regexp_replace(
                normalize(content_unit.content, NFKC),
                '\s+',
                ' ',
                'g'
              ))
            ) > 0
        ) then
          raise exception
            'evidence content unit must be an organization candidate'
            using errcode = '23514';
        end if;

        if v_outcome = 'conflicting' then
          section_citation :=
            response_section -> 'citations' -> v_evidence_index;
          if
            jsonb_typeof(section_citation) <> 'object'
            or section_citation - array[
              'knowledgeSourceId',
              'contentUnitId',
              'title',
              'url',
              'exactExcerpt'
            ] <> '{}'::jsonb
            or not section_citation ?& array[
              'knowledgeSourceId',
              'contentUnitId',
              'title',
              'url',
              'exactExcerpt'
            ]
            or section_citation ->> 'knowledgeSourceId'
              <> evidence_relationship ->> 'knowledgeSourceId'
            or section_citation ->> 'contentUnitId'
              <> evidence_relationship ->> 'contentUnitId'
            or section_citation ->> 'title'
              <> evidence_relationship ->> 'sourceTitle'
            or section_citation -> 'url'
              is distinct from evidence_relationship -> 'sourceUrl'
            or section_citation ->> 'exactExcerpt'
              <> evidence_relationship ->> 'exactExcerpt'
          then
            raise exception 'conflict citation identity is invalid'
              using errcode = '22023';
          end if;
        end if;

        v_evidence_index := v_evidence_index + 1;
      end loop;

      if
        v_outcome = 'conflicting'
        and jsonb_array_length(response_section -> 'citations')
          <> v_evidence_index
      then
        raise exception 'conflict citations must match evidence'
          using errcode = '22023';
      end if;

      if
        v_outcome = 'conflicting'
        and (
          select count(distinct evidence ->> 'contentUnitId')
          from jsonb_array_elements(
            coverage_decision -> 'evidence'
          ) as evidence
        ) < 2
      then
        raise exception 'conflict requires distinct evidence'
          using errcode = '22023';
      end if;

      if v_outcome = 'supported' then
        if
          jsonb_array_length(response_section -> 'citations')
            not between 1 and 3
        then
          raise exception 'supported request requires citations'
            using errcode = '22023';
        end if;

        for section_citation in
          select value
          from jsonb_array_elements(
            response_section -> 'citations'
          )
        loop
          if
            jsonb_typeof(section_citation) <> 'object'
            or section_citation - array[
              'knowledgeSourceId',
              'title',
              'url'
            ] <> '{}'::jsonb
            or not section_citation ?& array[
              'knowledgeSourceId',
              'title',
              'url'
            ]
            or not exists (
              select 1
              from jsonb_array_elements(
                coverage_decision -> 'evidence'
              ) as evidence
              where evidence ->> 'knowledgeSourceId'
                  = section_citation ->> 'knowledgeSourceId'
                and evidence ->> 'sourceTitle'
                  = section_citation ->> 'title'
                and evidence -> 'sourceUrl'
                  is not distinct from section_citation -> 'url'
            )
          then
            raise exception 'supported citation identity is invalid'
              using errcode = '22023';
          end if;
        end loop;
        v_supported_count := v_supported_count + 1;
      elsif v_outcome = 'conflicting' then
        v_conflicting_count := v_conflicting_count + 1;
      end if;
    else
      if
        jsonb_array_length(
          factual_request -> 'missingInformation'
        ) = 0
        or exists (
          select 1
          from jsonb_array_elements(
            factual_request -> 'missingInformation'
          ) as missing
          where jsonb_typeof(missing) <> 'string'
            or char_length(btrim(missing #>> '{}'))
              not between 1 and 300
        )
        or (factual_request ->> 'clarificationRound')::integer
          not between 1 and 2
        or decision_request ? 'coverage'
        or v_outcome not in (
          'clarification_request',
          'human_handoff'
        )
        or v_status <> (
          case v_outcome
            when 'clarification_request' then 'clarification'
            else 'handoff'
          end
        )
        or jsonb_array_length(
          response_section -> 'citations'
        ) <> 0
        or (
          v_outcome = 'clarification_request'
          and response_section ? 'contact'
        )
        or (
          v_outcome = 'human_handoff'
          and (
            (factual_request ->> 'clarificationRound')::integer
              <> 2
            or not response_section ? 'contact'
            or jsonb_typeof(response_section -> 'contact')
              <> 'object'
            or (response_section -> 'contact') - array[
              'label',
              'url'
            ] <> '{}'::jsonb
            or not (response_section -> 'contact')
              ?& array['label', 'url']
            or jsonb_typeof(
              response_section -> 'contact' -> 'label'
            ) <> 'string'
            or char_length(btrim(
              response_section -> 'contact' ->> 'label'
            )) not between 1 and 120
            or jsonb_typeof(
              response_section -> 'contact' -> 'url'
            ) <> 'string'
            or char_length(btrim(
              response_section -> 'contact' ->> 'url'
            )) not between 1 and 2000
            or response_section -> 'contact' ->> 'label'
              <> v_human_contact_label
            or response_section -> 'contact' ->> 'url'
              <> v_human_contact_url
          )
        )
      then
        raise exception 'incomplete multi request outcome is invalid'
          using errcode = '22023';
      end if;

      if v_outcome = 'clarification_request' then
        if
          (factual_request ->> 'clarificationRound')::integer = 2
          and not exists (
            select 1
            from (
              select
                previous_request.clarification_round,
                coalesce(
                  previous_request.response_content,
                  previous_result.content
                ) as clarification_content
              from public.message_factual_requests as previous_request
              join public.messages as previous_result
                on previous_result.id =
                  previous_request.assistant_message_id
                and previous_result.organization_id =
                  previous_request.organization_id
              where previous_request.organization_id =
                  v_organization_id
                and previous_request.conversation_id =
                  target_conversation_id
                and previous_request.original_text =
                  factual_request ->> 'originalText'
                and previous_request.completeness = 'incomplete'
                and (
                  previous_request.response_status = 'clarification'
                  or (
                    previous_request.response_status is null
                    and previous_result.message_type =
                      'clarification_request'
                  )
                )
                and previous_result.message_type in (
                  'clarification_request',
                  'partially_grounded_answer'
                )
                and previous_result.status = 'completed'
              order by
                previous_result.created_at desc,
                previous_request.created_at desc,
                previous_request.id desc
              limit 1
            ) as latest_clarification
            where latest_clarification.clarification_round = 1
              and btrim(latest_clarification.clarification_content)
                <> btrim(response_section ->> 'content')
          )
        then
          raise exception
            'clarification round two requires round one'
            using errcode = '22023';
        end if;
        v_clarification_count := v_clarification_count + 1;
      else
        if not exists (
          select 1
          from (
            select previous_request.clarification_round
            from public.message_factual_requests as previous_request
            join public.messages as previous_result
              on previous_result.id =
                previous_request.assistant_message_id
              and previous_result.organization_id =
                previous_request.organization_id
            where previous_request.organization_id =
                v_organization_id
              and previous_request.conversation_id =
                target_conversation_id
              and previous_request.original_text =
                factual_request ->> 'originalText'
              and previous_request.completeness = 'incomplete'
              and (
                previous_request.response_status = 'clarification'
                or (
                  previous_request.response_status is null
                  and previous_result.message_type =
                    'clarification_request'
                )
              )
              and previous_result.message_type in (
                'clarification_request',
                'partially_grounded_answer'
              )
              and previous_result.status = 'completed'
            order by
              previous_result.created_at desc,
              previous_request.created_at desc,
              previous_request.id desc
            limit 1
          ) as latest_clarification
          where latest_clarification.clarification_round = 2
        ) then
          raise exception
            'human handoff requires two clarification rounds'
            using errcode = '22023';
        end if;
        v_handoff_count := v_handoff_count + 1;
      end if;
    end if;
  end loop;

  v_expected_result_type := case
    when v_supported_count = v_request_count
      then 'grounded_answer'
    when v_supported_count > 0
      then 'partially_grounded_answer'
    when v_clarification_count > 0
      then 'clarification_request'
    when v_handoff_count > 0
      then 'human_handoff'
    when v_conflicting_count > 0
      then 'knowledge_conflict'
    else 'grounded_refusal'
  end;

  if result_type <> v_expected_result_type then
    raise exception 'multi request result type is invalid'
      using errcode = '22023';
  end if;

  select pending.id
  into v_completed_message_id
  from public.messages as pending
  where pending.conversation_id = target_conversation_id
    and pending.organization_id = v_organization_id
    and pending.message_type = 'grounded_answer'
    and pending.status = 'pending'
  for update;

  if v_completed_message_id is null then
    raise exception 'pending assistant message not found'
      using errcode = 'P0002';
  end if;

  select visitor.id
  into v_visitor_message_id
  from public.messages as visitor
  where visitor.organization_id = v_organization_id
    and visitor.conversation_id = target_conversation_id
    and visitor.message_type = 'visitor_question'
    and visitor.status = 'completed'
    and visitor.created_at <= (
      select created_at
      from public.messages
      where id = v_completed_message_id
    )
  order by visitor.created_at desc, visitor.id desc
  limit 1;

  if v_visitor_message_id is null then
    raise exception 'completed response exchange is invalid'
      using errcode = '23514';
  end if;

  update public.messages
  set
    message_type = result_type,
    content = (
      select string_agg(
        btrim(section ->> 'content'),
        E'\n\n'
        order by (section ->> 'order')::integer
      )
      from jsonb_array_elements(result_sections) as section
    ),
    status = 'completed'
  where id = v_completed_message_id;

  if result_type = 'grounded_refusal' then
    delete from public.unresolved_questions
    where answer_message_id = v_completed_message_id
      and factual_request_id is null
      and trigger_type = 'grounded_refusal';
  end if;

  for v_index in 0..v_request_count - 1 loop
    decision_request :=
      multi_request_decision -> 'requests' -> v_index;
    factual_request := decision_request -> 'factualRequest';
    coverage_decision := decision_request -> 'coverage';
    response_section := result_sections -> v_index;
    v_factual_request_id := (factual_request ->> 'id')::uuid;
    v_outcome := decision_request ->> 'outcome';

    insert into public.message_factual_requests (
      id,
      organization_id,
      conversation_id,
      visitor_message_id,
      assistant_message_id,
      request_order,
      original_text,
      normalized_question,
      completeness,
      coverage_status,
      missing_information,
      clarification_round,
      request_analysis_version,
      response_strategy_version,
      response_content,
      response_status
    ) values (
      v_factual_request_id,
      v_organization_id,
      target_conversation_id,
      v_visitor_message_id,
      v_completed_message_id,
      v_index + 1,
      factual_request ->> 'originalText',
      factual_request ->> 'normalizedQuestion',
      factual_request ->> 'completeness',
      case
        when factual_request ->> 'completeness' = 'complete'
          then v_outcome
        else null
      end,
      factual_request -> 'missingInformation',
      (factual_request ->> 'clarificationRound')::integer,
      multi_request_decision ->> 'requestAnalysisVersion',
      multi_request_decision ->> 'responseStrategyVersion',
      btrim(response_section ->> 'content'),
      response_section ->> 'status'
    );

    if v_outcome in ('supported', 'conflicting') then
      for section_citation in
        select value
        from jsonb_array_elements(
          response_section -> 'citations'
        )
      loop
        insert into public.citations (
          organization_id,
          conversation_id,
          message_id,
          knowledge_source_id,
          source_title,
          source_url,
          factual_request_id
        ) values (
          v_organization_id,
          target_conversation_id,
          v_completed_message_id,
          (section_citation ->> 'knowledgeSourceId')::uuid,
          section_citation ->> 'title',
          section_citation ->> 'url',
          v_factual_request_id
        );
      end loop;

      for evidence_relationship in
        select value
        from jsonb_array_elements(
          coverage_decision -> 'evidence'
        )
      loop
        insert into public.evidence_snapshots (
          organization_id,
          conversation_id,
          factual_request_id,
          content_unit_id,
          knowledge_source_id,
          source_title,
          source_url,
          relationship,
          exact_excerpt,
          decision_reason,
          coverage_decision_version
        ) values (
          v_organization_id,
          target_conversation_id,
          v_factual_request_id,
          (evidence_relationship ->> 'contentUnitId')::uuid,
          (evidence_relationship ->> 'knowledgeSourceId')::uuid,
          evidence_relationship ->> 'sourceTitle',
          evidence_relationship ->> 'sourceUrl',
          evidence_relationship ->> 'relationship',
          evidence_relationship ->> 'exactExcerpt',
          evidence_relationship ->> 'reason',
          coverage_decision ->> 'version'
        );
      end loop;
    end if;

    if v_outcome in ('unsupported', 'conflicting') then
      insert into public.unresolved_questions (
        organization_id,
        conversation_id,
        question_message_id,
        answer_message_id,
        factual_request_id,
        question,
        answer_content,
        citations,
        trigger_type,
        status
      ) values (
        v_organization_id,
        target_conversation_id,
        v_visitor_message_id,
        v_completed_message_id,
        v_factual_request_id,
        factual_request ->> 'originalText',
        response_section ->> 'content',
        response_section -> 'citations',
        case v_outcome
          when 'unsupported' then 'unsupported_factual_request'
          else 'knowledge_conflict'
        end,
        'pending'
      );
    end if;
  end loop;

  return v_completed_message_id;
end;
$$;

revoke all
on function public.complete_public_multi_request_decision(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb
)
from public;

grant execute
on function public.complete_public_multi_request_decision(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb
)
to service_role;

create function public.get_public_latest_clarification_states(
  assistant_public_id uuid,
  target_conversation_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target_conversation as (
    select
      conversation.id,
      conversation.organization_id
    from public.conversations as conversation
    join public.assistants as assistant
      on assistant.id = conversation.assistant_id
      and assistant.organization_id = conversation.organization_id
    where conversation.id = target_conversation_id
      and assistant.public_id = assistant_public_id
  ),
  latest_result as (
    select result.id, result.message_type, result.content
    from public.messages as result
    join target_conversation as target
      on target.id = result.conversation_id
      and target.organization_id = result.organization_id
    where result.message_type not in (
        'visitor_question',
        'answer_retry'
      )
      and result.status = 'completed'
    order by result.created_at desc, result.id desc
    limit 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'originalText', factual_request.original_text,
        'round', factual_request.clarification_round,
        'latestClarification', coalesce(
          factual_request.response_content,
          latest_result.content
        )
      )
      order by factual_request.request_order
    ),
    '[]'::jsonb
  )
  from latest_result
  join public.message_factual_requests as factual_request
    on factual_request.assistant_message_id = latest_result.id
  where latest_result.message_type in (
      'clarification_request',
      'partially_grounded_answer'
    )
    and factual_request.completeness = 'incomplete'
    and factual_request.clarification_round in (1, 2)
    and (
      factual_request.response_status = 'clarification'
      or (
        factual_request.response_status is null
        and latest_result.message_type = 'clarification_request'
      )
    );
$$;

revoke all
on function public.get_public_latest_clarification_states(uuid, uuid)
from public;

grant execute
on function public.get_public_latest_clarification_states(uuid, uuid)
to service_role;

drop function public.begin_public_conversation_with_clarification_state(
  uuid,
  text,
  uuid,
  boolean,
  integer,
  integer,
  boolean
);

create function public.begin_public_conversation_with_clarification_state(
  assistant_public_id uuid,
  visitor_question text,
  requested_conversation_id uuid default null,
  retry_failed_question boolean default false,
  daily_message_budget integer default 500,
  context_message_limit integer default 6,
  request_uses_ai boolean default true
)
returns table (
  request_status text,
  conversation_id uuid,
  assistant_message_id uuid,
  organization_id uuid,
  assistant_id uuid,
  name text,
  service_scope text,
  tone text,
  human_contact_label text,
  human_contact_url text,
  context_messages jsonb,
  question_count integer,
  clarification_original_text text,
  clarification_round smallint,
  clarification_content text,
  clarification_states jsonb
)
language sql
volatile
security definer
set search_path = ''
as $$
  select
    begun.request_status,
    begun.conversation_id,
    begun.assistant_message_id,
    begun.organization_id,
    begun.assistant_id,
    begun.name,
    begun.service_scope,
    begun.tone,
    begun.human_contact_label,
    begun.human_contact_url,
    begun.context_messages,
    begun.question_count,
    first_state.value ->> 'originalText',
    (first_state.value ->> 'round')::smallint,
    first_state.value ->> 'latestClarification',
    clarification.states
  from public.begin_public_conversation(
    assistant_public_id,
    visitor_question,
    requested_conversation_id,
    retry_failed_question,
    daily_message_budget,
    context_message_limit,
    request_uses_ai
  ) as begun
  left join lateral (
    select public.get_public_latest_clarification_states(
      assistant_public_id,
      begun.conversation_id
    ) as states
  ) as clarification
    on begun.request_status = 'accepted'
  left join lateral (
    select value
    from jsonb_array_elements(clarification.states)
    limit 1
  ) as first_state
    on true;
$$;

revoke all
on function public.begin_public_conversation_with_clarification_state(
  uuid,
  text,
  uuid,
  boolean,
  integer,
  integer,
  boolean
)
from public;

grant execute
on function public.begin_public_conversation_with_clarification_state(
  uuid,
  text,
  uuid,
  boolean,
  integer,
  integer,
  boolean
)
to service_role;
