"use client";

import { usePathname } from "next/navigation";
import { ToastContainer, Bounce } from "react-toastify";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick={false}
        rtl={false}
        pauseOnFocusLoss={false}
        pauseOnHover={false}
        draggable
        theme="light"
        transition={Bounce}
      />
      {children}
    </>
  );
}
