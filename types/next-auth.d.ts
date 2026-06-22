import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      isApproved: boolean;
      deltaUserId: string | null;
    };
  }
  interface User {
    id: string;
    role: string;
    isApproved?: boolean;
    deltaUserId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    isApproved: boolean;
    deltaUserId: string | null;
  }
}
