import { body, param } from 'express-validator';
import { handleValidationErrors } from './validators.js';

export const createTravelExpenseValidators = [
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isNumeric().withMessage('Amount must be a number')
    .custom(val => parseFloat(val) > 0).withMessage('Amount must be positive'),
  body('currency')
    .optional()
    .isString().withMessage('Currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code')
    .toUpperCase(),
  body('converted_amount')
    .optional({ nullable: true })
    .isNumeric().withMessage('Converted amount must be a number'),
  body('converted_currency')
    .optional()
    .isString().withMessage('Converted currency must be a string')
    .isLength({ min: 3, max: 3 }).withMessage('Converted currency must be a 3-letter code')
    .toUpperCase(),
  body('exchange_rate')
    .optional({ nullable: true })
    .isNumeric().withMessage('Exchange rate must be a number'),
  body('date')
    .notEmpty().withMessage('Date is required')
    .isString().withMessage('Date must be a string'),
  body('description')
    .optional({ nullable: true })
    .isString().withMessage('Description must be a string')
    .isLength({ max: 500 }).withMessage('Description too long (max 500 chars)')
    .trim(),
  body('vendor')
    .optional({ nullable: true })
    .isString().withMessage('Vendor must be a string')
    .isLength({ max: 200 }).withMessage('Vendor name too long (max 200 chars)')
    .trim(),
  body('category_id')
    .optional({ nullable: true }),
  body('trip_name')
    .optional({ nullable: true })
    .isString().withMessage('Trip name must be a string')
    .isLength({ max: 200 }).withMessage('Trip name too long (max 200 chars)')
    .trim(),
  body('source')
    .optional({ nullable: true }),
  body('notes')
    .optional({ nullable: true })
    .isString().withMessage('Notes must be a string')
    .isLength({ max: 1000 }).withMessage('Notes too long (max 1000 chars)')
    .trim(),
  handleValidationErrors,
];

export const updateTravelExpenseValidators = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid travel expense ID'),
  body('amount')
    .optional({ nullable: true })
    .isNumeric().withMessage('Amount must be a number'),
  body('currency')
    .optional({ nullable: true })
    .isString()
    .isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code')
    .toUpperCase(),
  body('converted_amount')
    .optional({ nullable: true })
    .isNumeric().withMessage('Converted amount must be a number'),
  body('converted_currency')
    .optional({ nullable: true })
    .isString()
    .isLength({ min: 3, max: 3 }).withMessage('Converted currency must be a 3-letter code')
    .toUpperCase(),
  body('exchange_rate')
    .optional({ nullable: true })
    .isNumeric().withMessage('Exchange rate must be a number'),
  body('date')
    .optional({ nullable: true }),
  body('description')
    .optional({ nullable: true }),
  body('vendor')
    .optional({ nullable: true }),
  body('category_id')
    .optional({ nullable: true }),
  body('trip_name')
    .optional({ nullable: true }),
  body('notes')
    .optional({ nullable: true }),
  handleValidationErrors,
];

export const getTravelExpenseValidators = [
  param('id')
    .isInt({ min: 1 }).withMessage('Invalid travel expense ID'),
  handleValidationErrors,
];

export const listTravelExpenseValidators = [
  handleValidationErrors,
];
