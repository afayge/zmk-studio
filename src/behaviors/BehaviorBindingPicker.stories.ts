import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { BehaviorBindingPicker } from "./BehaviorBindingPicker";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: "Behaviors/BehaviorBindingPicker",
  component: BehaviorBindingPicker,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: "fullscreen",
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ["autodocs"],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {
    // backgroundColor: { control: 'color' },
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#action-args
  args: {
    layers: [
      { name: "Base", id: 0 },
      { id: 1, name: "Num" },
    ],
    onBindingChanged: fn(),
  },
} satisfies Meta<typeof BehaviorBindingPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Example: Story = {
  args: {
    binding: { behaviorId: 0, param1: 0x70014, param2: 0 },
    behaviors: [
      {
        id: 0,
        displayName: "Key Press",
        metadata: [
          {
            param1: [
              { name: "Key", hidUsage: { consumerMax: 255, keyboardMax: 231 } },
            ],
            param2: [],
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const board = within(
      canvas.getByRole("region", { name: "Basic key keyboard" }),
    );
    await expect(board.getAllByRole("button")).toHaveLength(104);
    await userEvent.click(board.getByRole("button", { name: "Keypad 1" }));
    await expect(args.onBindingChanged).toHaveBeenLastCalledWith({
      behaviorId: 0,
      param1: 0x70059,
      param2: 0,
    });
    await expect(canvas.queryByRole("button", { name: "Lighting" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Macros" })).toBeNull();
  },
};

export const SearchMute: Story = {
  args: {
    binding: { behaviorId: 17, param1: 0x70004, param2: 0 },
    behaviors: [
      {
        id: 17,
        displayName: "Key Press",
        metadata: [
          {
            param1: [
              { name: "Key", hidUsage: { keyboardMax: 101, consumerMax: 234 } },
            ],
            param2: [],
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("searchbox");
    await userEvent.type(search, "1");
    for (const [group, label, code] of [
      ["Number row", "1", 0x7001e],
      ["Numeric keypad", "Keypad 1", 0x70059],
    ] as const) {
      const matches = within(canvas.getByRole("region", { name: group }));
      await userEvent.click(matches.getByRole("button", { name: label }));
      await expect(args.onBindingChanged).toHaveBeenLastCalledWith({
        behaviorId: 17,
        param1: code,
        param2: 0,
      });
    }
    await userEvent.clear(search);
    await userEvent.type(search, "音量");
    await expect(
      within(await canvas.findByRole("region", { name: "Volume" })).getByRole(
        "heading",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "Application launch" }),
    ).toBeNull();
    await userEvent.clear(search);
    await userEvent.type(search, "静音");
    await userEvent.click(
      within(canvas.getByRole("region", { name: "Volume" })).getByRole(
        "button",
        { name: "Mute" },
      ),
    );
    await expect(args.onBindingChanged).toHaveBeenCalledWith({
      behaviorId: 17,
      param1: 0xc00e2,
      param2: 0,
    });
  },
};

export const DeviceActions: Story = {
  args: {
    binding: { behaviorId: 8, param1: 7, param2: 0 },
    behaviors: [
      {
        id: 8,
        displayName: "RGB Underglow",
        metadata: [
          {
            param1: [
              { name: "Toggle On/Off", constant: 7 },
              { name: "Next Effect", constant: 19 },
            ],
            param2: [],
          },
        ],
      },
      { id: 9, displayName: "Screenshot Macro", metadata: [] },
      { id: 10, displayName: "Custom Accent", metadata: [] },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Lighting" }));
    const effect = canvas.getByRole("button", { name: "Next Effect" });
    await expect(effect.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "effectNext",
    );
    await userEvent.click(effect);
    await expect(args.onBindingChanged).toHaveBeenLastCalledWith({
      behaviorId: 8,
      param1: 19,
      param2: 0,
    });
    await userEvent.click(canvas.getByRole("button", { name: "Macros" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Screenshot Macro" }),
    );
    await expect(args.onBindingChanged).toHaveBeenLastCalledWith({
      behaviorId: 9,
      param1: 0,
      param2: 0,
    });
    await userEvent.type(canvas.getByRole("searchbox"), "Accent");
    await userEvent.click(
      canvas.getByRole("button", { name: "Custom Accent" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Apply binding" }),
    ).toBeVisible();
  },
};

export const IconActions: Story = {
  args: {
    binding: Example.args!.binding,
    layers: [
      { id: 12, name: "Base" },
      { id: 37, name: "Navigation" },
    ],
    behaviors: [
      ...Example.args!.behaviors!,
      ...DeviceActions.args!.behaviors!,
      {
        id: 11,
        displayName: "Momentary Layer",
        metadata: [{ param1: [{ name: "Layer", layerId: {} }], param2: [] }],
      },
      {
        id: 12,
        displayName: "Mod-Tap",
        metadata: [
          {
            param1: [
              { name: "Hold", hidUsage: { keyboardMax: 231, consumerMax: 0 } },
            ],
            param2: [
              { name: "Tap", hidUsage: { keyboardMax: 231, consumerMax: 0 } },
            ],
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const nav = within(
      canvas.getByRole("navigation", { name: "Action categories" }),
    );
    const results = () =>
      within(canvas.getByRole("region", { name: "Matching actions" }));
    for (const category of [
      "Media",
      "Special keys",
      "Shortcuts",
      "Layers",
      "Tap / hold",
      "Lighting",
      "All behaviors",
      "Macros",
    ]) {
      await userEvent.click(nav.getByRole("button", { name: category }));
      const buttons = results().getAllByRole("button");
      await expect(
        buttons.every(
          (b) =>
            b.getAttribute("aria-label") && b.querySelector("svg[data-icon]"),
        ),
      ).toBe(true);
    }
    const macro = results().getByRole("button", { name: "Screenshot Macro" });
    await userEvent.hover(macro);
    await expect(
      await page.findByRole("tooltip", { name: "Screenshot Macro" }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(page.queryByRole("tooltip")).toBeNull();

    await userEvent.click(nav.getByRole("button", { name: "Layers" }));
    const target = results().getByRole("button", {
      name: "Hold for layer · Navigation",
    });
    await expect(target).toHaveTextContent("1");
    await userEvent.click(target);
    await expect(args.onBindingChanged).toHaveBeenLastCalledWith({
      behaviorId: 11,
      param1: 37,
      param2: 0,
    });
    await userEvent.tab({ shift: true });
    await expect(
      await page.findByRole("tooltip", { name: "Hold for layer · Base" }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(page.queryByRole("tooltip")).toBeNull();

    await userEvent.type(canvas.getByRole("searchbox"), "F13");
    const f13 = results().getByRole("button", { name: "Keyboard F13" });
    await expect(f13.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "keycap",
    );
    await userEvent.click(f13);
    await expect(args.onBindingChanged).toHaveBeenLastCalledWith({
      behaviorId: 0,
      param1: 0x70068,
      param2: 0,
    });
    await userEvent.click(nav.getByRole("button", { name: "Tap / hold" }));
    const edit = results().getByRole("button", { name: "Custom mod-tap" });
    await expect(edit.querySelector('[data-icon="edit"]')).toBeInTheDocument();
    await userEvent.click(edit);
    await expect(
      canvas.getByRole("button", { name: "Apply binding" }),
    ).toBeVisible();
  },
};
