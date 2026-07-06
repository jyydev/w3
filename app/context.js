"use client";
import { createContext, useContext, useState } from "react";

const RootContext = createContext();

export const RootProvider = ({ children }) => {
  const [routeLoading, setNavigationLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const navigationLoading = routeLoading || walletLoading;

  return (
    <RootContext.Provider
      value={{
        navigationLoading,
        routeLoading,
        setNavigationLoading,
        walletLoading,
        setWalletLoading,
      }}
    >
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
