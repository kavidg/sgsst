import { Types } from 'mongoose';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  _id?: string;
  role?: string;
}

export interface RequestWithUser {
  headers: {
    authorization?: string;
    'x-company-id'?: string;
  };
  user?: AuthenticatedUser;
  companyId?: Types.ObjectId;
}
