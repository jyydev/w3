module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ["eslint:recommended"],
  plugins: ["react-hooks"],
  parserOptions: {
    ecmaFeatures: { jsx: true },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  globals: {
    E: "readonly",
    getNxCookies: "readonly",
    isAr: "readonly",
    isOb: "readonly",
    parse: "readonly",
    prec: "readonly",
    toFixed: "readonly",
    uid: "readonly",
  },
  ignorePatterns: [".next/", ".next-dev/", "node_modules/", "out/", "public/"],
  rules: {
    "no-empty": "off",
    "no-regex-spaces": "off",
    "no-unused-vars": "off",
    "no-useless-escape": "off",
    "react-hooks/rules-of-hooks": "error",
  },
};
