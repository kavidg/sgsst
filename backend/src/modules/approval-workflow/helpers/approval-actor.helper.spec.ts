import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildApprovalActor } from './approval-actor.helper';

describe('buildApprovalActor', () => {
  it('prefiere el ObjectId del usuario cuando existe', () => {
    const actor = buildApprovalActor({
      userId: '64b000000000000000000001',
      firebaseUid: 'firebase-uid-1',
      email: 'maria@test.com',
      name: 'Maria Guzman',
      role: 'manager',
    });

    assert.equal(actor.userId, '64b000000000000000000001');
    assert.equal(actor.firebaseUid, 'firebase-uid-1');
    assert.equal(actor.email, 'maria@test.com');
    assert.equal(actor.name, 'Maria Guzman');
    assert.equal(actor.role, 'manager');
    assert.ok(actor.timestamp instanceof Date);
  });

  it('usa el firebaseUid cuando no existe ObjectId', () => {
    const actor = buildApprovalActor({
      firebaseUid: 'firebase-uid-2',
      email: 'juan@test.com',
      role: 'owner',
    });

    assert.equal(actor.userId, 'firebase-uid-2');
    assert.equal(actor.firebaseUid, 'firebase-uid-2');
    assert.equal(actor.role, 'owner');
  });

  it('mantiene compatibilidad cuando no hay nombre', () => {
    const actor = buildApprovalActor({
      userId: '64b000000000000000000001',
      email: 'x@test.com',
      role: 'member',
    });

    assert.equal(actor.userId, '64b000000000000000000001');
    assert.equal(actor.name, undefined);
    assert.equal(actor.role, 'member');
  });

  it('aplica valores seguros por defecto', () => {
    const actor = buildApprovalActor({});

    assert.equal(actor.userId, 'unknown');
    assert.equal(actor.email, '');
    assert.equal(actor.role, 'member');
    assert.ok(actor.timestamp instanceof Date);
  });
});
