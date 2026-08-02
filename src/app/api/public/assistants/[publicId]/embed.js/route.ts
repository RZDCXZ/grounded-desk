import { createPrivilegedSupabaseClient } from "@/lib/supabase/privileged";
import { getEmbedApplicationUrl } from "@/lib/server-config";

type PublishedAssistant = {
  name: string;
};

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc("get_published_assistant", {
    assistant_public_id: publicId,
  });
  const assistant = (data as PublishedAssistant[] | null)?.[0];

  if (error) {
    console.error("读取嵌入助手失败", {
      code: error.code,
      message: error.message,
    });
  }

  if (error || !assistant) {
    return new Response("/* 该助手当前不可公开访问。 */", {
      status: 404,
      headers: scriptHeaders(),
    });
  }

  return new Response(
    createEmbedLoader({
      assistantName: assistant.name,
      frameUrl: `${getEmbedApplicationUrl()}/a/${publicId}?embedded=1`,
      mountId: `groundeddesk-embed-${publicId}`,
    }),
    {
      headers: scriptHeaders(),
    },
  );
}

function scriptHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/javascript; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

function createEmbedLoader({
  assistantName,
  frameUrl,
  mountId,
}: {
  assistantName: string;
  frameUrl: string;
  mountId: string;
}) {
  const configuration = JSON.stringify({
    assistantName,
    frameUrl,
    mountId,
  });

  return `(() => {
  "use strict";

  const configuration = ${configuration};

  function mountGroundedDesk() {
    if (document.getElementById(configuration.mountId) || !document.body) {
      return;
    }

    const mount = document.createElement("div");
    mount.id = configuration.mountId;
    const root = mount.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = \`
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      .panel {
        position: fixed;
        right: 20px;
        bottom: 92px;
        z-index: 2147483000;
        width: min(400px, calc(100vw - 32px));
        height: min(640px, calc(100dvh - 112px));
        overflow: hidden;
        border: 1px solid rgba(32, 36, 33, 0.14);
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 8px 24px rgba(16, 41, 30, 0.08);
        opacity: 0;
        transform: translateY(4px) scale(0.98);
        transition: opacity 220ms ease-out, transform 220ms ease-out;
      }
      .panel[data-open="true"] {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .panel[hidden] { display: none; }
      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: #f7f7f3;
      }
      button {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483001;
        display: grid;
        width: 56px;
        height: 56px;
        padding: 0;
        place-items: center;
        border: 1px solid transparent;
        border-radius: 12px;
        background: #1a3c2b;
        color: #ffffff;
        box-shadow: 0 8px 24px rgba(16, 41, 30, 0.08);
        cursor: pointer;
        transition: filter 160ms ease-out, transform 160ms ease-out;
      }
      button:hover { filter: brightness(0.94); }
      button:active { transform: translateY(1px); }
      button:focus-visible {
        outline: 2px solid #1a3c2b;
        outline-offset: 2px;
      }
      svg { width: 24px; height: 24px; }
      .close-icon { display: none; }
      button[aria-expanded="true"] .open-icon { display: none; }
      button[aria-expanded="true"] .close-icon { display: block; }
      @media (max-width: 480px) {
        .panel {
          right: 12px;
          bottom: 88px;
          width: calc(100vw - 24px);
          height: calc(100dvh - 104px);
        }
        button { right: 16px; bottom: 16px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .panel, button { transition: none; }
        .panel { transform: none; }
      }
    \`;

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.hidden = true;
    panel.id = \`\${configuration.mountId}-panel\`;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", \`\${configuration.assistantName}会话\`);

    const frame = document.createElement("iframe");
    frame.title = \`\${configuration.assistantName}会话\`;
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.sandbox.add(
      "allow-forms",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-same-origin",
      "allow-scripts",
    );
    panel.append(frame);

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-controls", panel.id);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", \`打开\${configuration.assistantName}\`);
    button.innerHTML = \`
      <svg class="open-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>
        <path d="M8 12h.01M12 12h.01M16 12h.01"></path>
      </svg>
      <svg class="close-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="m6 6 12 12M18 6 6 18"></path>
      </svg>
    \`;

    let closeTimer;
    let openAnimationFrame;

    function setOpen(open) {
      window.clearTimeout(closeTimer);
      window.cancelAnimationFrame(openAnimationFrame);

      if (open && !frame.src) {
        frame.src = configuration.frameUrl;
      }

      if (open) {
        panel.hidden = false;
        panel.dataset.open = "false";
        openAnimationFrame = window.requestAnimationFrame(() => {
          openAnimationFrame = window.requestAnimationFrame(() => {
            panel.dataset.open = "true";
          });
        });
      } else {
        panel.dataset.open = "false";
        closeTimer = window.setTimeout(() => {
          panel.hidden = true;
        }, 220);
      }

      button.setAttribute("aria-expanded", String(open));
      button.setAttribute(
        "aria-label",
        \`\${open ? "关闭" : "打开"}\${configuration.assistantName}\`,
      );
    }

    function placeLauncherAwayFromHostActions() {
      const launcherSize = 56;
      const edge = window.innerWidth <= 480 ? 16 : 20;
      const gap = 12;
      let bottom = edge;

      const hostActions = document.querySelectorAll(
        "a, button, [role='button'], input, select, textarea",
      );
      for (const action of hostActions) {
        if (mount.contains(action)) {
          continue;
        }

        const rect = action.getBoundingClientRect();
        const occupiesLauncherArea =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > window.innerWidth - edge - launcherSize - gap &&
          rect.left < window.innerWidth - edge + gap &&
          rect.bottom > window.innerHeight - bottom - launcherSize - gap &&
          rect.top < window.innerHeight - bottom + gap;

        if (occupiesLauncherArea) {
          bottom = Math.max(bottom, window.innerHeight - rect.top + gap);
        }
      }

      bottom = Math.min(
        bottom,
        Math.max(edge, window.innerHeight - launcherSize - gap),
      );
      button.style.bottom = \`\${bottom}px\`;
      panel.style.bottom = \`\${bottom + 72}px\`;
      panel.style.height = \`min(640px, calc(100dvh - \${bottom + 92}px))\`;
    }

    button.addEventListener("click", () => {
      placeLauncherAwayFromHostActions();
      setOpen(button.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        button.focus();
      }
    });

    root.append(style, panel, button);
    document.body.append(mount);
    placeLauncherAwayFromHostActions();
    window.addEventListener("resize", placeLauncherAwayFromHostActions);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountGroundedDesk, { once: true });
  } else {
    mountGroundedDesk();
  }
})();`;
}
