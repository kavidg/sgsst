import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';
import { ReactNode } from 'react';
import { PdfBaseInput } from './types';

export const pdfStyles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingBottom: 10,
    marginBottom: 12,
  },
  logo: {
    width: 48,
    height: 48,
    objectFit: 'contain',
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    color: '#4b5563',
  },
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 6,
  },
  paragraph: {
    lineHeight: 1.4,
  },
  table: {
    display: 'flex',
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  row: {
    flexDirection: 'row',
  },
  cellHeader: {
    backgroundColor: '#f3f4f6',
    fontWeight: "bold",
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    padding: 4,
    fontSize: 9,
  },
  footer: {
    marginTop: 12,
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'right',
  },
});

export function PdfHeader({ data }: { data: PdfBaseInput }) {
  return (
    <View style={pdfStyles.header}>
      <View>
        <Text style={pdfStyles.title}>{data.title}</Text>
        <Text style={pdfStyles.subtitle}>{data.company.name}</Text>
        <Text style={pdfStyles.subtitle}>NIT: {data.company.nit}</Text>
        <Text style={pdfStyles.subtitle}>Fecha: {data.date}</Text>
      </View>
      {data.company.logoUrl ? <Image src={data.company.logoUrl} style={pdfStyles.logo} /> : null}
    </View>
  );
}

export function PdfSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={pdfStyles.section}>
      <Text style={pdfStyles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

interface PdfTableProps {
  headers: string[];
  rows: string[][];
}

export function PdfTable({ headers, rows }: PdfTableProps) {
  const columnWidth = `${100 / headers.length}%`;

  return (
    <View style={pdfStyles.table}>
      <View style={pdfStyles.row}>
        {headers.map((header) => (
          <Text key={header} style={[pdfStyles.cell, pdfStyles.cellHeader, { width: columnWidth }]}>
            {header}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View style={pdfStyles.row} key={`${row.join('-')}-${index}`}>
          {row.map((cell, cellIndex) => (
            <Text key={`${cellIndex}-${cell}`} style={[pdfStyles.cell, { width: columnWidth }]}>
              {cell || '-'}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
