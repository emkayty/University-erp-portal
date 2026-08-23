'use client';

import { useId, useState } from 'react';
import type { StudentSearchResultV1 } from '@uniportal/types';
import { Input } from '@/components/ui/input';
import { useStudentSearch } from '@/hooks/use-search';

interface StudentPickerProps {
  value: string;
  onChange: (studentId: string, student?: StudentSearchResultV1) => void;
  label?: string;
  placeholder?: string;
  selectedLabel?: string;
  filters?: Record<string, string>;
  required?: boolean;
}

function studentLabel(student: StudentSearchResultV1): string {
  return `${student.matricNo} · ${student.firstName} ${student.lastName}`;
}

/**
 * Permission-scoped student selection for staff workflows. The component
 * never asks users to copy a database UUID, while the API remains the security
 * boundary and decides which records are searchable for the current role.
 */
export function StudentPicker({
  value,
  onChange,
  label = 'Student',
  placeholder = 'Search by matric number or name',
  selectedLabel,
  filters,
  required = false,
}: StudentPickerProps) {
  const inputId = useId();
  const listboxId = `${inputId}-options`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [chosenLabel, setChosenLabel] = useState(selectedLabel ?? 'Selected student');
  const { data: matches = [], isFetching } = useStudentSearch(query, filters);

  const clearSelection = () => {
    onChange('');
    setChosenLabel('');
    setQuery('');
    setOpen(false);
  };

  const selectStudent = (student: StudentSearchResultV1) => {
    onChange(student.id, student);
    setChosenLabel(studentLabel(student));
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative space-y-1">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}{required ? ' *' : ''}
      </label>
      {value ? (
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[--color-primary]/40 bg-[--color-primary]/5 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{chosenLabel}</p>
            <p className="text-xs text-muted-foreground">Student selected from your permitted records</p>
          </div>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-md px-3 text-sm font-medium text-[--color-primary] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]"
            onClick={clearSelection}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <Input
            id={inputId}
            value={query}
            required={required}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
          />
          {open && query.trim().length >= 2 && (
            <div
              id={listboxId}
              role="listbox"
              aria-label={`${label} search results`}
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg"
            >
              {isFetching ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">Searching permitted student records…</p>
              ) : matches.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">No permitted student records found.</p>
              ) : (
                matches.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex min-h-11 w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectStudent(student)}
                  >
                    <span className="text-sm font-medium text-foreground">{studentLabel(student)}</span>
                    <span className="text-xs text-muted-foreground">{student.programme} · Level {student.level} · {student.status}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
