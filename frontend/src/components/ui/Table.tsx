import { ReactNode } from 'react';

type TableProps = {
  children: ReactNode;
};

export function Table({ children }: TableProps) {
  return (
    <div className="table-wrap">
      <table className="table">{children}</table>
    </div>
  );
}
