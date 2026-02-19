export interface AuthenticatedUser {
  uid: string;
}

export interface RequestWithUser {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
}
