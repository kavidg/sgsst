import { ReactNode } from 'react';

type TableProps = {
  children: ReactNode;
};

export function Table({ children }: TableProps) {
  return (
    <div className="table-wrap">
      <table className="table w-full border-2 border-black border-collapse border-solid [&_th]:border [&_th]:border-black [&_th]:border-solid [&_td]:border [&_td]:border-black [&_td]:border-solid">{children}</table>
    </div>
  );
}
