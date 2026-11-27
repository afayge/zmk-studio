import { KeyboardEvent, useState } from "react";

export function OutputTest() {
  const [events, setEvents] = useState<string[]>([]);
  const record = (e: KeyboardEvent) => {
    if (e.key === "Tab") return;
    e.preventDefault();
    const mods = (["Control", "Alt", "Shift", "Meta"] as const)
      .filter((m) => e.getModifierState(m))
      .join(" + ");
    const row = [e.type === "keydown" ? "Down" : "Up", e.code, e.key, mods]
      .filter(Boolean)
      .join(" · ");
    setEvents((prev) => [row, ...prev].slice(0, 24));
  };
  return (
    <section className="tool-panel">
      <strong>Key output test</strong>
      <p>
        Focus the test area and press keys. It shows events received by this
        window. Tab leaves the area.
      </p>
      <div
        className="test-area"
        tabIndex={0}
        aria-label="Keyboard test area"
        onKeyDown={record}
        onKeyUp={record}
      >
        Test area
      </div>
      <button className="studio-button" onClick={() => setEvents([])}>
        Clear events
      </button>
      <ol>
        {events.map((event, index) => (
          <li key={index}>{event}</li>
        ))}
      </ol>
    </section>
  );
}
