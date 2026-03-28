import React, { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function Card({ children, title, className = '', style }: CardProps) {
  return (
    <section className={`card ${className}`.trim()} style={style}>
      {title ? <h2 className="card-title">{title}</h2> : null}
      {children}
    </section>
  );
}
