const EXTENSION_ATTR =
  /data-(new-gr-c-s-check-loaded|gr-ext-installed|gr-ext-disabled|lt-installed)|cz-shortcut-listen|native-dark-class-modified/;

const original = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const text = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      return "";
    })
    .join(" ");
  if (/hydrat/i.test(text) && EXTENSION_ATTR.test(text)) return;
  original(...args);
};
