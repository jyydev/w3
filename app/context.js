"use client";
import { createContext, useContext } from "react";

const RootContext = createContext();

export const RootProvider = ({ children }) => {
  return <RootContext.Provider value={{}}>{children}</RootContext.Provider>;
};

const cgb = () => useContext(RootContext);

export default cgb;

/***** README */

/*** usage */
// use in any client page: import cgb from "@/app/context"; let cg = cgb(); cg.a = 1;

/*** config */
// in layout.js: import { RootProvider } from "./context";   return (..<RootProvider>..</RootProvider>)
