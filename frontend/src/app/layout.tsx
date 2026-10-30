import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knowledge Assistant",
  description: "Multi-tenant AI knowledge and decision assistant",
};

const STRIP_EXTENSION_ATTRS = `(function(){var k=["data-new-gr-c-s-check-loaded","data-gr-ext-installed","data-gr-ext-disabled","data-lt-installed","cz-shortcut-listen"];var cls="native-dark-class-modified";function strip(n){if(!n||n.nodeType!==1)return;for(var i=0;i<k.length;i++)n.removeAttribute(k[i]);if(n.classList&&n.classList.contains(cls))n.classList.remove(cls);}function run(){strip(document.documentElement);strip(document.body);var all=document.getElementsByClassName(cls);while(all.length)all[0].classList.remove(cls);}run();try{new MutationObserver(run).observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:k.concat(["class"])});}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: STRIP_EXTENSION_ATTRS }} />
        {children}
      </body>
    </html>
  );
}
