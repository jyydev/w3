import "ygb/nx";
import "./globals.css";
import "@/app/App.css";
import Navbar from "/components/Navbar";
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
          <Navbar />
          <div>{children}</div>
          <Toaster />
        </RootProvider>
      </body>
    </html>
  );
}
