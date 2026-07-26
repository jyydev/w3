"use client";

export default function FavoriteButton({
  active = false,
  className = "",
  label = "",
  onClick,
  scope = "",
}) {
  const action = active ? "remove from" : "add to";
  const target = [scope, "favorites"].filter(Boolean).join(" ");
  const title = `${action} ${target}`;

  return (
    <button
      type="button"
      className={[className, active ? "active" : ""]
        .filter(Boolean)
        .join(" ")}
      title={title}
      aria-label={`${title}${label ? `: ${label}` : ""}`}
      draggable="false"
      onClick={onClick}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
