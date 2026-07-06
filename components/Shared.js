import { forwardRef } from "react";

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

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export const CustomPicker = forwardRef(function CustomPicker(
  { className = "", children, ...props },
  ref,
) {
  return (
    <div className={cn("customPicker", className)} ref={ref} {...props}>
      {children}
    </div>
  );
});

export function CustomPickerButton({ className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={cn("customPickerButton", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function CustomPickerMenu({ className = "", children }) {
  return <div className={cn("customPickerMenu", className)}>{children}</div>;
}

export function CustomPickerColumn({ title = "", className = "", children }) {
  return (
    <div className={cn("customPickerColumn", className)}>
      <span className="customPickerColumnTitle">{title}</span>
      {children}
    </div>
  );
}

export function CustomPickerTable({
  className = "",
  headers = [],
  children,
}) {
  return (
    <table
      className={cn("customPickerDataTable", "customPickerTable", className)}
    >
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th key={`${index}_${String(header?.key || header)}`}>{header}</th>
          ))}
        </tr>
      </thead>
      {children}
    </table>
  );
}

export function CustomPickerRow({
  active = false,
  unsupported = false,
  className = "",
  onClick,
  children,
  ...props
}) {
  return (
    <tr
      className={cn(
        "customPickerRow",
        active ? "on" : "",
        unsupported ? "unsupported" : "",
        className,
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  );
}

export function CustomPickerCell({ className = "", colSpan, children }) {
  return (
    <td className={className} colSpan={colSpan}>
      {children}
    </td>
  );
}

export function CustomPickerSortHeader({
  activeSort = "",
  sortKey = "",
  onSort = () => {},
  className = "",
  children,
}) {
  return (
    <TableSortHeader
      activeSort={activeSort}
      sortKey={sortKey}
      onSort={onSort}
      className={cn("customPickerSortHeader", className)}
    >
      {children}
    </TableSortHeader>
  );
}
