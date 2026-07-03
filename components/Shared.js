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
