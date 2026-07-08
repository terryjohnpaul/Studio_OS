import { auth, currentUser } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/lib/types/members";

export async function requireWriteAccess(): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) throw new Error("Authentication required");
  if (member.role === "viewer") throw new Error("You have view-only access. Contact your admin for full access.");
  if (member.status === "disabled") throw new Error("Your account has been disabled");
  return member;
}

/**
 * Get or create the current member record.
 * First Clerk user to visit becomes Owner.
 * Subsequent users become Members.
 */
export async function getCurrentMember(): Promise<Member | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = await createClient();

  // Check if member exists by clerk_id
  const { data: existing } = await supabase
    .from("members")
    .select("id, email, role, status, clerk_id, full_name, avatar_url, is_manager, created_at")
    .eq("clerk_id", userId)
    .single();

  if (existing) return existing as Member;

  // Auto-register: get Clerk user details
  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses[0]?.emailAddress || "";
  const fullName = user.fullName || user.firstName || email.split("@")[0];

  // Check if ANY members exist — first one becomes Owner
  const { count } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true });

  const role = (count === null || count === 0) ? "owner" : "viewer";

  // Create the member record
  const { data: newMember, error } = await supabase
    .from("members")
    .insert({
      clerk_id: userId,
      email,
      full_name: fullName,
      avatar_url: user.imageUrl || null,
      role,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    // May already exist by email — try to link
    const { data: byEmail } = await supabase
      .from("members")
      .select("id, email, role, status, clerk_id, full_name, avatar_url, is_manager, created_at")
      .eq("email", email)
      .single();

    if (byEmail) {
      await supabase
        .from("members")
        .update({ clerk_id: userId, full_name: fullName, avatar_url: user.imageUrl, status: "active" })
        .eq("id", byEmail.id);
      return { ...byEmail, clerk_id: userId, full_name: fullName, status: "active" } as Member;
    }
    return null;
  }

  return newMember as Member;
}
