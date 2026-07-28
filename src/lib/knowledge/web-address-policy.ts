import { BlockList, isIP } from "node:net";

export type ResolvedWebAddress = {
  address: string;
  family: 4 | 6;
};

const blockedWebAddresses = createBlockedWebAddresses();

export function parseWebSourceUrl(value: string) {
  try {
    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

export function getLiteralWebAddress(
  hostname: string,
): ResolvedWebAddress | null {
  const family = isIP(hostname);

  if (family !== 4 && family !== 6) {
    return null;
  }

  return { address: hostname, family: family as 4 | 6 };
}

export function isBlockedWebAddress({
  address,
  family,
}: ResolvedWebAddress) {
  return (
    (family === 6 && address.toLowerCase().startsWith("::ffff:")) ||
    blockedWebAddresses.check(address, family === 4 ? "ipv4" : "ipv6")
  );
}

function createBlockedWebAddresses() {
  const blockList = new BlockList();
  const ipv4Subnets: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  const ipv6Subnets: Array<[string, number]> = [
    ["::", 128],
    ["::1", 128],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ];

  for (const [network, prefix] of ipv4Subnets) {
    blockList.addSubnet(network, prefix, "ipv4");
  }

  for (const [network, prefix] of ipv6Subnets) {
    blockList.addSubnet(network, prefix, "ipv6");
  }

  return blockList;
}
