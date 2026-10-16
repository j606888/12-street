import { redirect } from "next/navigation";

// No landing page: customers go straight to ordering (LINE login first).
export default function Home() {
  redirect("/order");
}
