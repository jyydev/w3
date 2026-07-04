"use client";
import { createContext, useContext, useState } from "react";

const RootContext = createContext();

export const RootProvider = ({ children }) => {
  const [navigationLoading, setNavigationLoading] = useState(false);

  return (
    <RootContext.Provider value={{ navigationLoading, setNavigationLoading }}>
      {children}
    </RootContext.Provider>
  );
};

const cgb = () => useContext(RootContext);

export default cgb;

/***** README */

/*** usage */
// use in any client page: import cgb from "@/app/context"; let cg = cgb(); cg.a = 1;

/*** config */
// in layout.js: import { RootProvider } from "./context";   return (..<RootProvider>..</RootProvider>)
