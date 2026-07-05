export function CycleButton({
  direction = "next",
  children,
  className = "",
  size = "small",
  type = "button",
  ...props
}) {
  const label = children ?? (direction == "prev" ? "<" : ">");
  const sizeClass = size ? String(size) : "small";

  return (
    <button
      type={type}
      className={["btn", sizeClass, "bgGray", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {label}
    </button>
  );
}

export function TableSortHeader({
  activeSort = "",
  sortKey = "",
  setSort,
  onSort,
  className = "",
  children,
}) {
  return (
    <button
      type="button"
      className={[
        "sortableHeader",
        activeSort == sortKey ? "on" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        if (onSort) {
          onSort(sortKey);
          return;
        }
        setSort?.((current) => (current == sortKey ? "" : sortKey));
      }}
    >
      {children}
    </button>
  );
}
