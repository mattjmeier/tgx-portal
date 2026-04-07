import "@testing-library/jest-dom";

if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock-url";
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => undefined;
}
