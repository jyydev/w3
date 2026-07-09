"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import {
  discoveryCacheMs,
  formatDiscoveryCacheDuration,
  getDiscoveryCacheAgeMs,
  getDiscoveryCacheRemainingMs,
} from "@/fn/discoveryCache";

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

export function CycleButtonPair({
  onPrev,
  onNext,
  prevDisabled = false,
  nextDisabled = false,
  disabled = false,
  size = "small",
  className = "",
  prevProps = {},
  nextProps = {},
}) {
  return (
    <span className={["cycleButtonPair", className].filter(Boolean).join(" ")}>
      <CycleButton
        {...prevProps}
        size={size}
        direction="prev"
        onClick={onPrev}
        disabled={disabled || prevDisabled || prevProps.disabled}
      />
      <CycleButton
        {...nextProps}
        size={size}
        onClick={onNext}
        disabled={disabled || nextDisabled || nextProps.disabled}
      />
    </span>
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

function getCustomPickerColumnInfo(title = "", historyLimit = 5) {
  const key = String(title || "").trim().toLowerCase();
  if (key == "history") {
    return `Recent selections saved in cookies. Latest first. Cap: ${historyLimit}.`;
  }
  if (key == "all") {
    return "All local selectable options from the app data and settings.";
  }
  if (key == "discovery") {
    return "Dynamically loaded protocol/API options. Items may appear after discovery finishes.";
  }

  return "";
}

export function CustomPickerColumn({
  title = "",
  className = "",
  info,
  historyLimit = 5,
  children,
}) {
  const infoText =
    info === undefined ? getCustomPickerColumnInfo(title, historyLimit) : info;

  return (
    <div className={cn("customPickerColumn", className)}>
      <span className="customPickerColumnTitle">
        <span>{title}</span>
        {infoText && (
          <span className="infoHover hoverOnlyInfo customPickerColumnInfo">
            <span className="infoIcon">i</span>
            <span className="infoCard">{infoText}</span>
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

function formatCacheTime(ts = 0) {
  const at = Number(ts || 0);
  if (!at) return "-";

  return new Date(at).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DiscoveryCacheInfo({
  cacheMeta = null,
  onReload,
  ttlMs = discoveryCacheMs,
} = {}) {
  const meta = cacheMeta || {};
  const source = meta.source == "cache" ? "cache" : meta.source ? "fresh api" : "-";
  const location = meta.location || meta.cacheLocation || "-";
  const finalTtlMs = Number(meta.ttlMs || ttlMs || discoveryCacheMs);
  const ageText = meta.at ? formatDiscoveryCacheDuration(getDiscoveryCacheAgeMs(meta)) : "-";
  const remainingText = meta.at
    ? formatDiscoveryCacheDuration(getDiscoveryCacheRemainingMs(meta))
    : "-";

  return (
    <span className="customPickerCacheInfo">
      <span>Dynamically loaded protocol/API options.</span>
      <span>source: {source}</span>
      <span>cache type: {location}</span>
      <span>cache: {formatDiscoveryCacheDuration(finalTtlMs)}</span>
      <span>cached: {formatCacheTime(meta.at)}</span>
      <span>age: {ageText}</span>
      <span>expires: {remainingText}</span>
      {onReload && (
        <button
          type="button"
          className="btn small bgGray"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReload(e);
          }}
        >
          reload
        </button>
      )}
    </span>
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

function getCustomPickerOptionValue(option) {
  return typeof option == "string" ? option : String(option?.value ?? "");
}

function getCustomPickerOptionLabel(option) {
  if (typeof option == "string") return option;
  return String(option?.label ?? option?.value ?? "");
}

function sortCustomPickerOptions(
  options = [],
  sortKey = "",
  getters = {},
  directionM = {},
) {
  if (!sortKey) return options;
  const getter = getters[sortKey] || getCustomPickerOptionLabel;
  const direction = directionM[sortKey] || "asc";
  const multiplier = direction == "desc" ? -1 : 1;

  return [...options].sort((a, b) =>
    String(getter(a) ?? "").localeCompare(String(getter(b) ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * multiplier,
  );
}

export function getCustomPickerHistoryCycleValues(
  historyOptions = [],
  allOptions = [],
  getOptionValue = getCustomPickerOptionValue,
  isOptionDisabled = () => false,
) {
  const getValues = (options = []) =>
    options
      .filter((option) => !isOptionDisabled(option))
      .map(getOptionValue)
      .filter(Boolean);
  const historyValues = getValues(historyOptions);

  return historyValues.length ? historyValues : getValues(allOptions);
}

export function CustomHistoryPicker({
  selectedValue = "",
  selectedLabel = "",
  extraSections = [],
  extraSectionsPosition = "after",
  historyOptions = [],
  allOptions = [],
  showMenu,
  setShowMenu,
  pickerRef,
  pickerSortM,
  setPickerSortM,
  sortKeyPrefix = "customHistoryPicker",
  header = "select",
  historyTitle = "history",
  allTitle = "all",
  historyLimit = 5,
  emptyHistoryText = "-",
  emptyAllText = "-",
  className = "",
  pickerClassName = "",
  buttonClassName = "",
  menuClassName = "",
  tableClassName = "",
  allTableClassName = "",
  showCycle,
  cycleSize = "small",
  cycleDisabled,
  disabled = false,
  getOptionValue = getCustomPickerOptionValue,
  getOptionLabel = getCustomPickerOptionLabel,
  getOptionLink = () => "",
  getOptionTitle = getCustomPickerOptionLabel,
  optionColumns,
  isOptionDisabled = (option) => !!option?.disabled,
  onSelect = () => {},
  onRemoveHistory,
  onPrev = () => {},
  onNext = () => {},
  onOpen = () => {},
  onFocus,
}) {
  const internalRef = useRef(null);
  const effectiveRef = pickerRef || internalRef;
  const [internalOpen, setInternalOpen] = useState(false);
  const [internalSortM, setInternalSortM] = useState({});
  const isControlledOpen = showMenu !== undefined;
  const isControlledSort = pickerSortM !== undefined;
  const open = isControlledOpen ? showMenu : internalOpen;
  const sortM = isControlledSort ? pickerSortM : internalSortM;
  const setOpen = setShowMenu || setInternalOpen;
  const setSortM = setPickerSortM || setInternalSortM;
  const shouldShowCycle = showCycle ?? !!(onPrev || onNext);
  const hasAnyOptions =
    allOptions.length ||
    historyOptions.length ||
    extraSections.some((section) => section?.options?.length);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(e) {
      if (!effectiveRef.current?.contains(e.target)) setOpen(false);
    }

    function closeOnEscape(e) {
      if (e.key == "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [effectiveRef, open, setOpen]);

  function pickerSortKey(section = "all") {
    return `${sortKeyPrefix}:${section || "all"}`;
  }

  function toggleSort(section = "all", sortKey = "") {
    const key = pickerSortKey(section);
    setSortM((prev = {}) => ({
      ...prev,
      [key]: prev[key] == sortKey ? "" : sortKey,
    }));
  }

  const columns = propsOptionColumns(optionColumns, header, getOptionLabel);

  function SortHeader({ section = "all", column, children }) {
    const sortKey = column?.key || "label";
    return (
      <CustomPickerSortHeader
        activeSort={sortM[pickerSortKey(section)] || ""}
        sortKey={sortKey}
        onSort={() => toggleSort(section, sortKey)}
      >
        {children}
      </CustomPickerSortHeader>
    );
  }

  function sortedOptions(
    section = "all",
    options = [],
    sectionColumns = columns,
    sectionGetOptionLabel = getOptionLabel,
  ) {
    const getterM = Object.fromEntries(
      sectionColumns.map((column) => [
        column.key,
        column.getSortValue || column.getValue || sectionGetOptionLabel,
      ]),
    );
    const directionM = Object.fromEntries(
      sectionColumns.map((column) => [
        column.key,
        column.sortDirection || "asc",
      ]),
    );
    return sortCustomPickerOptions(
      options,
      sortM[pickerSortKey(section)] || "",
      getterM,
      directionM,
    );
  }

  function selectOption(option, sectionConfig = {}) {
    const sectionIsOptionDisabled =
      sectionConfig.isOptionDisabled || isOptionDisabled;
    const sectionGetOptionValue = sectionConfig.getOptionValue || getOptionValue;
    const sectionOnSelect = sectionConfig.onSelect || onSelect;

    if (!option || sectionIsOptionDisabled(option)) return;
    sectionOnSelect(sectionGetOptionValue(option), option);
    setOpen(false);
  }

  function removeHistoryOption(e, option, sectionGetOptionValue = getOptionValue) {
    e.stopPropagation();
    if (!option) return;
    onRemoveHistory?.(sectionGetOptionValue(option), option);
  }

  function renderRows({
    section = "all",
    options = [],
    emptyText = "-",
    sectionColumns = columns,
    sectionConfig = {},
    sectionGetOptionValue = getOptionValue,
    sectionGetOptionLabel = getOptionLabel,
    sectionGetOptionLink = getOptionLink,
    sectionGetOptionTitle = getOptionTitle,
    sectionIsOptionDisabled = isOptionDisabled,
  } = {}) {
    const rows = sortedOptions(
      section,
      options,
      sectionColumns,
      sectionGetOptionLabel,
    );
    if (!rows.length) {
      return (
        <tr>
          <CustomPickerCell colSpan={sectionColumns.length}>
            <span className="gray">{emptyText}</span>
          </CustomPickerCell>
        </tr>
      );
    }

    return rows.map((option, rowIndex) => {
      const value = sectionGetOptionValue(option);
      const label = sectionGetOptionLabel(option);
      const rowKey = [
        section,
        value,
        option?.chain,
        option?.address,
        option?.underlyingAddress,
        option?.lendAddress,
        option?.market,
        rowIndex,
      ]
        .filter((part) => part !== undefined && part !== null && part !== "")
        .join("_");
      const optionLink = sectionGetOptionLink(option);
      const linkHref =
        typeof optionLink == "string" ? optionLink : optionLink?.href || "";
      const linkLabel =
        typeof optionLink == "string" ? "↗" : optionLink?.label || "↗";
      const linkTitle =
        typeof optionLink == "string"
          ? `open ${label}`
          : optionLink?.title || `open ${label}`;
      const history =
        sectionConfig.showRemoveHistory ?? section == "history";
      return (
        <CustomPickerRow
          key={rowKey}
          active={value == selectedValue}
          unsupported={sectionIsOptionDisabled(option)}
          onClick={() => selectOption(option, sectionConfig)}
          title={sectionGetOptionTitle(option)}
        >
          {sectionColumns.map((column, index) => (
            <CustomPickerCell
              key={`${rowKey}_${column.key}`}
              className={column.className || ""}
            >
              {column.getValue(option)}
              {index == 0 && linkHref && (
                <>
                  {" "}
                  <a
                    className="gray externalLinkIcon"
                    href={linkHref}
                    target="_blank"
                    rel="noreferrer"
                    title={linkTitle}
                    aria-label={linkTitle}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {linkLabel}
                  </a>
                </>
              )}
              {index == 0 && history && onRemoveHistory && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="walletDeleteButton walletHistoryRemoveButton"
                    title={`remove ${label} from history`}
                    aria-label={`remove ${label} from history`}
                    onClick={(e) =>
                      removeHistoryOption(e, option, sectionGetOptionValue)
                    }
                  >
                    <TrashIcon />
                  </button>
                </>
              )}
            </CustomPickerCell>
          ))}
        </CustomPickerRow>
      );
    });
  }

  function renderSection({
    section = "all",
    title = "",
    options = [],
    emptyText = "-",
    tableClassName: sectionTableClassName = "",
    header: sectionHeader = header,
    optionColumns: sectionOptionColumns = optionColumns,
    getOptionValue: sectionGetOptionValue = getOptionValue,
    getOptionLabel: sectionGetOptionLabel = getOptionLabel,
    getOptionLink: sectionGetOptionLink = getOptionLink,
    getOptionTitle: sectionGetOptionTitle = getOptionTitle,
    isOptionDisabled: sectionIsOptionDisabled = isOptionDisabled,
    onSelect: sectionOnSelect = onSelect,
    showRemoveHistory,
    info,
    beforeTable = null,
    renderBody,
  }) {
    const sectionConfig = {
      getOptionValue: sectionGetOptionValue,
      isOptionDisabled: sectionIsOptionDisabled,
      onSelect: sectionOnSelect,
      showRemoveHistory,
    };
    const sectionColumns = propsOptionColumns(
      sectionOptionColumns,
      sectionHeader,
      sectionGetOptionLabel,
    );

    return (
      <CustomPickerColumn
        key={section}
        title={title}
        historyLimit={historyLimit}
        info={info}
      >
        {beforeTable}
        <CustomPickerTable
          className={cn(sectionTableClassName, tableClassName)}
          headers={sectionColumns.map((column) => (
            <SortHeader
              key={`${section}_${column.key}`}
              section={section}
              column={column}
            >
              {column.label}
            </SortHeader>
          ))}
        >
          <tbody>
            {typeof renderBody == "function"
              ? renderBody({
                  columns: sectionColumns,
                  renderRows: (override = {}) =>
                    renderRows({
                      section,
                      options,
                      emptyText,
                      sectionColumns,
                      sectionConfig,
                      sectionGetOptionValue,
                      sectionGetOptionLabel,
                      sectionGetOptionLink,
                      sectionGetOptionTitle,
                      sectionIsOptionDisabled,
                      ...override,
                    }),
                })
              : renderRows({
                  section,
                  options,
                  emptyText,
                  sectionColumns,
                  sectionConfig,
                  sectionGetOptionValue,
                  sectionGetOptionLabel,
                  sectionGetOptionLink,
                  sectionGetOptionTitle,
                  sectionIsOptionDisabled,
                })}
          </tbody>
        </CustomPickerTable>
      </CustomPickerColumn>
    );
  }

  const cycleValues = getCustomPickerHistoryCycleValues(
    historyOptions,
    allOptions,
    getOptionValue,
    isOptionDisabled,
  );
  const buttonOptions = [
    ...extraSections.flatMap((section) => section?.options || []),
    ...historyOptions,
    ...allOptions,
  ];
  const buttonText =
    selectedLabel ||
    getOptionLabel(
      buttonOptions.find(
        (option) => getOptionValue(option) == selectedValue,
      ),
    ) ||
    selectedValue ||
    header;
  const picker = (
    <CustomPicker className={pickerClassName} ref={effectiveRef}>
      <CustomPickerButton
        className={buttonClassName}
        disabled={disabled || !hasAnyOptions}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) onOpen();
        }}
        onFocus={onFocus}
        aria-expanded={open}
      >
        {buttonText}
      </CustomPickerButton>
      {open && (
        <CustomPickerMenu className={menuClassName}>
          {extraSectionsPosition == "before" &&
            extraSections.map((section) => renderSection(section))}
          {renderSection({
            section: "history",
            title: historyTitle,
            options: historyOptions,
            emptyText: emptyHistoryText,
          })}
          {renderSection({
            section: "all",
            title: allTitle,
            options: allOptions,
            emptyText: emptyAllText,
            tableClassName: allTableClassName,
          })}
          {extraSectionsPosition != "before" &&
            extraSections.map((section) => renderSection(section))}
        </CustomPickerMenu>
      )}
    </CustomPicker>
  );

  if (!shouldShowCycle) return picker;

  return (
    <span className={cn("selectCycle", "walletCycle", className)}>
      <CycleButtonPair
        size={cycleSize}
        onPrev={onPrev}
        onNext={onNext}
        disabled={cycleDisabled ?? cycleValues.length < 2}
      />
      {picker}
    </span>
  );
}

function propsOptionColumns(
  columns,
  header,
  fallbackGetValue = getCustomPickerOptionLabel,
) {
  if (Array.isArray(columns) && columns.length) {
    return columns.map((column) => ({
      key: column.key || "label",
      label: column.label || column.key || header,
      className: column.className || "",
      getValue: column.getValue || getCustomPickerOptionLabel,
      getSortValue: column.getSortValue || column.getValue,
      sortDirection: column.sortDirection || "",
    }));
  }

  return [
    {
      key: "label",
      label: header,
      getValue: fallbackGetValue,
      getSortValue: fallbackGetValue,
    },
  ];
}
