import { Suspense } from "react";
import { connection } from "next/server";
import { getMyProfile } from "./actions";
import { ProfileForm } from "./profile-form";
import { User } from "lucide-react";
import { Separator } from "@/components/ui/separator";

async function ProfileContent() {
  await connection();
  const profile = await getMyProfile();

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <User className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Your Profile</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Make it yours — update your name, photo, and details.
        </p>
      </div>
      <Separator className="mb-6" />
      <ProfileForm profile={profile} />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Loading your profile...</div>}>
      <ProfileContent />
    </Suspense>
  );
}
