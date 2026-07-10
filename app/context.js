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

const useCgb = () => useContext(RootContext);

export default useCgb;

/***** README */

/*** usage */
// use in any client page: import useCgb from "@/app/context"; let cg = useCgb();

/*** config */
// in layout.js: import { RootProvider } from "./context";   return (..<RootProvider>..</RootProvider>)
