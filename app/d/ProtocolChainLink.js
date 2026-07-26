"use client";

import Link from "next/link";

export default function ProtocolChainLink({
  chain = "",
  filterPath = "/d",
  officialUrl = "",
  protocolName = "protocol",
}) {
  return (
    <span>
      <Link href={`${filterPath}?chains=${encodeURIComponent(chain)}`}>
        {chain}
      </Link>{" "}
      {officialUrl && (
        <a
          className="gray externalLinkIcon"
          href={officialUrl}
          target="_blank"
          rel="noreferrer"
          title={`Open ${protocolName} ${chain}`}
          aria-label={`Open ${protocolName} ${chain}`}
          onClick={(event) => event.stopPropagation()}
        >
          ↗
        </a>
      )}
    </span>
  );
}
