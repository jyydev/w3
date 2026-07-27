import Link from "next/link";

export default function TableCaptionTitle({
  children,
  collapsed = false,
  href = "",
  onToggle,
}) {
  const title = href ? (
    <Link className="tableCaptionLink" href={href}>
      {children}
    </Link>
  ) : (
    <span>{children}</span>
  );
  const toggleLabel = `${collapsed ? "show" : "hide"} ${children} table`;

  return (
    <span className="tableCaptionTitle">
      {title}
      {href && onToggle && (
        <button
          type="button"
          className="homeNavBranchToggle homeNavSectionToggle"
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          onClick={onToggle}
        >
          <span
            className={`homeNavBranchCaret ${collapsed ? "collapsed" : ""}`}
            aria-hidden="true"
          ></span>
        </button>
      )}
    </span>
  );
}
