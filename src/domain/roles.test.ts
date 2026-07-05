import { describe, it, expect } from 'vitest';
import { roleCanEdit, roleLabel, isRole, ROLES } from './roles';

describe('roles', () => {
  it('lists all five bridge/engine roles', () => {
    expect(ROLES.map((r) => r.value)).toEqual(['admin', 'master', 'navigation', 'environmental', 'marine']);
  });

  it('grants edit rights to everyone except the Marine', () => {
    expect(roleCanEdit('admin')).toBe(true);
    expect(roleCanEdit('master')).toBe(true);
    expect(roleCanEdit('navigation')).toBe(true);
    expect(roleCanEdit('environmental')).toBe(true);
    expect(roleCanEdit('marine')).toBe(false);
  });

  it('maps labels and validates role strings', () => {
    expect(roleLabel('environmental')).toBe('Environmental Officer');
    expect(isRole('admin')).toBe(true);
    expect(isRole('captain')).toBe(false);
  });
});
