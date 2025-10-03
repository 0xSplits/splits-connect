export const getHost = (mode: string) => {
  switch (mode) {
    case "production":
      return "https://teams.splits.org";
    case "dev":
      return "http://localhost:3001";
    default:
      return `https://teams.${mode}.splits.org`;
  }
};

export const getName = (mode: string) =>
  `Splits Connect${mode === "production" ? "" : `-${mode}`}`;
