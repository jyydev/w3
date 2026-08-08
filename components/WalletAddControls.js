"use client";

import { PassiveInfoCard } from "./Shared";

export default function WalletAddControls({
  address = "",
  adding = false,
  className = "",
  file = "",
  fileOptions = [],
  info = "Toggle on to add this address.",
  label = "",
  onFileChange,
  onLabelChange,
  onOpenChange,
  onPathChange,
  onSubmit,
  open = false,
  path = "",
  toggleLabel = "",
}) {
  return (
    <form
      className={["walletAddForm", className].filter(Boolean).join(" ")}
      onSubmit={onSubmit}
    >
      <PassiveInfoCard content={info}>
        {toggleLabel ? (
          <button
            type="button"
            className="btn small bgGray walletAddToggleButton"
            aria-expanded={open}
            onClick={() => onOpenChange?.(!open)}
          >
            {toggleLabel}
          </button>
        ) : (
          <label
            className="switch small walletAddSwitch"
            title="show add controls"
          >
            <input
              type="checkbox"
              checked={open}
              aria-label="show add wallet controls"
              onChange={(event) => onOpenChange?.(event.target.checked)}
            />
            <span className="slider"></span>
          </label>
        )}
      </PassiveInfoCard>
      {open && (
        <>
          <select
            value={file}
            aria-label="wallet path selection"
            onChange={(event) => onFileChange?.(event.target.value)}
            disabled={adding || !fileOptions.length}
          >
            {!fileOptions.length && <option value="">new file</option>}
            {fileOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={path}
            aria-label="wallet path"
            onChange={(event) => onPathChange?.(event.target.value)}
            placeholder="folder/file"
            disabled={adding}
            style={{ width: `${Math.max(path.length || 0, 10) + 2}ch` }}
          />
          <input
            type="text"
            value={label}
            aria-label="wallet label"
            onChange={(event) => onLabelChange?.(event.target.value)}
            placeholder="label"
            disabled={adding}
            style={{ width: `${Math.max(label.length || 0, 8) + 2}ch` }}
          />
          <button
            type="submit"
            className="btn small bgGray"
            disabled={adding || !String(address).trim() || !path.trim()}
          >
            {adding ? "..." : "save"}
          </button>
        </>
      )}
    </form>
  );
}
