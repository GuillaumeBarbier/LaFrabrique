"use client";

import { useEffect, useRef, useState } from "react";
import { TextArea, TextField } from "@/components/ui/field";

/**
 * A text field bound to a server value: edits stay local while focused and are saved after
 * a short pause; a remote change shows up as soon as the field is not being edited.
 */
function useBoundText(value: string, onSave: (value: string) => void, delay = 700) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestSave = useRef(onSave);
  useEffect(() => {
    latestSave.current = onSave;
  });

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    value: draft,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      clearTimeout(timer.current);
      if (draft !== value) latestSave.current(draft);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = e.target.value;
      setDraft(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latestSave.current(next), delay);
    },
  };
}

export function BoundTextField({
  value,
  onSave,
  ...rest
}: { value: string; onSave: (value: string) => void } & Omit<React.ComponentProps<typeof TextField>, "value" | "onChange">) {
  const bound = useBoundText(value, onSave);
  return <TextField {...rest} {...bound} />;
}

export function BoundTextArea({
  value,
  onSave,
  ...rest
}: { value: string; onSave: (value: string) => void } & Omit<React.ComponentProps<typeof TextArea>, "value" | "onChange">) {
  const bound = useBoundText(value, onSave);
  return <TextArea {...rest} {...bound} />;
}
