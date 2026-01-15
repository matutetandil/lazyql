import { describe, it, expect } from 'vitest';
import {
  fieldToGetterName,
  getterToFieldName,
  isGetterMethod,
  getGetterMethods,
} from '../../src/core/getter-mapper.js';

describe('getter-mapper', () => {
  describe('fieldToGetterName', () => {
    it('should convert simple field names', () => {
      expect(fieldToGetterName('status')).toBe('getStatus');
      expect(fieldToGetterName('id')).toBe('getId');
      expect(fieldToGetterName('name')).toBe('getName');
    });

    it('should convert snake_case to getCamelCase', () => {
      expect(fieldToGetterName('entity_id')).toBe('getEntityId');
      expect(fieldToGetterName('increment_id')).toBe('getIncrementId');
      expect(fieldToGetterName('grand_total')).toBe('getGrandTotal');
      expect(fieldToGetterName('customer_email')).toBe('getCustomerEmail');
      expect(fieldToGetterName('order_currency_code')).toBe('getOrderCurrencyCode');
    });

    it('should handle multiple underscores', () => {
      expect(fieldToGetterName('sales_consultant_name')).toBe('getSalesConsultantName');
      expect(fieldToGetterName('a_b_c_d')).toBe('getABCD');
    });
  });

  describe('getterToFieldName', () => {
    it('should convert simple getter names', () => {
      expect(getterToFieldName('getStatus')).toBe('status');
      expect(getterToFieldName('getId')).toBe('id');
      expect(getterToFieldName('getName')).toBe('name');
    });

    it('should convert getCamelCase to snake_case', () => {
      expect(getterToFieldName('getEntityId')).toBe('entity_id');
      expect(getterToFieldName('getIncrementId')).toBe('increment_id');
      expect(getterToFieldName('getGrandTotal')).toBe('grand_total');
      expect(getterToFieldName('getCustomerEmail')).toBe('customer_email');
    });

    it('should handle non-getter names gracefully', () => {
      expect(getterToFieldName('get')).toBe('get');
      expect(getterToFieldName('something')).toBe('something');
    });
  });

  describe('isGetterMethod', () => {
    it('should identify getter methods', () => {
      expect(isGetterMethod('getStatus')).toBe(true);
      expect(isGetterMethod('getEntityId')).toBe(true);
      expect(isGetterMethod('getSomething')).toBe(true);
    });

    it('should reject non-getter methods', () => {
      expect(isGetterMethod('get')).toBe(false);
      expect(isGetterMethod('status')).toBe(false);
      expect(isGetterMethod('setStatus')).toBe(false);
      expect(isGetterMethod('constructor')).toBe(false);
    });
  });

  describe('getGetterMethods', () => {
    it('should extract getter methods from a class prototype', () => {
      class TestClass {
        getStatus() { return 'ok'; }
        getEntityId() { return 1; }
        someOtherMethod() { return 'not a getter'; }
        private value = 'test';
      }

      const methods = getGetterMethods(TestClass.prototype);

      expect(methods).toContain('getStatus');
      expect(methods).toContain('getEntityId');
      expect(methods).not.toContain('someOtherMethod');
      expect(methods).not.toContain('constructor');
    });

    it('should include inherited getter methods', () => {
      class BaseClass {
        getBaseField() { return 'base'; }
      }

      class DerivedClass extends BaseClass {
        getDerivedField() { return 'derived'; }
      }

      const methods = getGetterMethods(DerivedClass.prototype);

      expect(methods).toContain('getBaseField');
      expect(methods).toContain('getDerivedField');
    });
  });
});
