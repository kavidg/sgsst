import { ReactNode } from 'react';

type TableProps = {
  children: ReactNode;
};

export function Table({ children }: TableProps) {
  return (
    <div className="table-wrap">
      <table className="table w-full border-2 border-black border-collapse">{children}</table>
    </div>
  );
}
