import "react";

// Folder uploads are non-standard, so React's types don't include this attribute
declare module "react" {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}
