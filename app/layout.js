import "ygb/nx";
import { Suspense } from "react";
import "./globals.css";
import "@/app/App.css";
import Navbar from "/components/Navbar";
import NavigationLoading from "@/components/NavigationLoading";
import HomeNavigationHistoryTracker from "@/components/HomeNavigationHistoryTracker";
import { Toaster } from "react-hot-toast";
import { RootProvider } from "./context"; //client component

export const metadata = {
  title: "W3",
  description: "W3 wallet and trade tools",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <RootProvider>
          <Suspense fallback={null}>
            <HomeNavigationHistoryTracker />
          </Suspense>
          <Navbar />
          <NavigationLoading />
          <div>{children}</div>
          <Toaster />
        </RootProvider>
      </body>
    </html>
  );
}
