import Logo from "@/components/Logo";
import { List, Section, Table } from "../RefParts";
import "../ref.css";

const cardRows = [
  [
    "HoverInfoCard",
    "Opens when its trigger is hovered or focused. The card can remain open while the pointer moves into it, so use it for details that must be inspected.",
  ],
  [
    "ClickInfoCard",
    "Opens and toggles when its trigger is clicked. Use it for click-open read-only details.",
  ],
  [
    "InteractiveInfoCard",
    "Shared interactive card for settings, tables, links, inputs, buttons, and tabs. It supports click activation by default or activation=hover, and clicks inside its panel do not dismiss it.",
  ],
  [
    "PassiveInfoCard: hover",
    "Compact, non-interactive information shown only while its trigger is hovered or focused. The card ignores pointer input and closes immediately after leaving the trigger. Cycle-button targets use this mode.",
  ],
  [
    "PassiveInfoCard: click",
    "Compact, non-interactive information opened by clicking its trigger. It uses the shared overlay dismissal behavior but the card itself still ignores pointer input. The wallets note uses this mode.",
  ],
];

const dismissRows = [
  [
    "HoverInfoCard",
    "Closes after leaving the trigger/card area, losing focus, or using the shared outside-pointer dismissal.",
  ],
  [
    "ClickInfoCard",
    "Closes when toggled, clicking outside, leaving the trigger/card area, or losing focus.",
  ],
  [
    "InteractiveInfoCard",
    "Uses the same shared dismissal behavior, but panel clicks remain inside the card. It closes by trigger toggle, outside click, pointer leave, or focus leaving the card.",
  ],
  [
    "Passive hover",
    "CSS-controlled; closes as soon as the trigger loses hover or focus. It has no persistent open state.",
  ],
  [
    "Passive click",
    "Closes when toggled, clicking outside, leaving the trigger, or losing focus. Hovering the card cannot keep it open.",
  ],
];

const implementationNotes = [
  "HoverInfoCard, ClickInfoCard, and InteractiveInfoCard share SharedInfoCard and useOverlayInteraction.",
  "InteractiveInfoCard is the synchronized wrapper for cards containing controls; its default activation is click and activation=hover is available.",
  "PassiveInfoCard supports activation=hover and activation=click from the same shared component.",
  "Click-activated passive cards reuse useOverlayInteraction for dismissal.",
  "Hover-activated passive cards use trigger-only CSS because they do not need persistent state or an outside-click listener.",
  "Use PassiveInfoCard only for short read-only reminders. Use InteractiveInfoCard when the card contains links, inputs, buttons, tabs, or selectable text that must remain available.",
];

function InfoCardsRefPage() {
  return (
    <div className="refPage">
      <Logo page="ref" />
      <h1 className="refTitle">Info cards</h1>
      <p className="refIntro">
        Shared card types for compact reminders, hover details, and clickable
        settings or controls.
      </p>

      <Section title="types">
        <Table rows={cardRows} />
      </Section>

      <Section title="dismissal">
        <Table rows={dismissRows} />
      </Section>

      <Section title="implementation">
        <List items={implementationNotes} />
      </Section>
    </div>
  );
}

export default InfoCardsRefPage;
