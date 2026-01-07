import { body, param, query, validationResult } from 'express-validator';

// Middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
    }
    next();
};

// Expense/Transaction validators
export const createExpenseValidators = [
    body('amount')
        .isNumeric().withMessage('Amount must be a number')
        .custom(val => val > 0).withMessage('Amount must be positive'),
    body('date')
        .isISO8601().withMessage('Date must be in YYYY-MM-DD format')
        .toDate(),
    body('description')
        .optional()
        .isString().withMessage('Description must be a string')
        .isLength({ max: 500 }).withMessage('Description too long (max 500 chars)')
        .trim()
        .escape(),
    body('vendor')
        .optional()
        .isString().withMessage('Vendor must be a string')
        .isLength({ max: 200 }).withMessage('Vendor name too long (max 200 chars)')
        .trim()
        .escape(),
    body('category_id')
        .optional()
        .isInt({ min: 1 }).withMessage('Invalid category ID'),
    body('type')
        .optional()
        .isIn(['expense', 'income']).withMessage('Type must be "expense" or "income"'),
    body('source')
        .optional()
        .isIn(['manual', 'whatsapp', 'whatsapp_image', 'api']).withMessage('Invalid source'),
    body('image_url')
        .optional()
        .isString().withMessage('Image URL must be a string')
        .isLength({ max: 500 }).withMessage('Image URL too long'),
    body('raw_text')
        .optional()
        .isString().withMessage('Raw text must be a string')
        .isLength({ max: 2000 }).withMessage('Raw text too long'),
    handleValidationErrors,
];

export const updateExpenseValidators = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid expense ID'),
    body('amount')
        .optional()
        .isNumeric().withMessage('Amount must be a number')
        .custom(val => val > 0).withMessage('Amount must be positive'),
    body('date')
        .optional()
        .isISO8601().withMessage('Date must be in YYYY-MM-DD format'),
    body('description')
        .optional()
        .isString().withMessage('Description must be a string')
        .isLength({ max: 500 }).withMessage('Description too long')
        .trim()
        .escape(),
    body('vendor')
        .optional()
        .isString().withMessage('Vendor must be a string')
        .isLength({ max: 200 }).withMessage('Vendor name too long')
        .trim()
        .escape(),
    body('category_id')
        .optional()
        .isInt({ min: 1 }).withMessage('Invalid category ID'),
    body('type')
        .optional()
        .isIn(['expense', 'income']).withMessage('Type must be "expense" or "income"'),
    handleValidationErrors,
];

export const getExpenseValidators = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid expense ID'),
    handleValidationErrors,
];

export const listExpenseValidators = [
    query('startDate')
        .optional()
        .isISO8601().withMessage('Start date must be in YYYY-MM-DD format'),
    query('endDate')
        .optional()
        .isISO8601().withMessage('End date must be in YYYY-MM-DD format'),
    query('categoryId')
        .optional()
        .isInt({ min: 1 }).withMessage('Invalid category ID'),
    query('type')
        .optional()
        .isIn(['expense', 'income']).withMessage('Type must be "expense" or "income"'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 500 }).withMessage('Limit must be between 1 and 500'),
    query('offset')
        .optional()
        .isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    handleValidationErrors,
];

// Parse validators
export const parseTextValidators = [
    body('text')
        .notEmpty().withMessage('Text is required')
        .isString().withMessage('Text must be a string')
        .isLength({ max: 1000 }).withMessage('Text too long (max 1000 chars)'),
    handleValidationErrors,
];

export const parseImageValidators = [
    body('image')
        .notEmpty().withMessage('Image is required')
        .isString().withMessage('Image must be a base64 string')
        .isLength({ max: 20 * 1024 * 1024 }).withMessage('Image too large (max ~15MB)'),
    handleValidationErrors,
];

// Upload validators
export const uploadValidators = [
    body('image')
        .notEmpty().withMessage('Image is required')
        .isString().withMessage('Image must be a base64 string')
        .isLength({ max: 20 * 1024 * 1024 }).withMessage('Image too large'),
    body('filename')
        .optional()
        .isString().withMessage('Filename must be a string')
        .isLength({ max: 100 }).withMessage('Filename too long')
        .matches(/^[a-zA-Z0-9_\-\.]+$/).withMessage('Invalid filename characters'),
    handleValidationErrors,
];

// Sanitize base64 image - remove potential script injections
export const sanitizeBase64Image = (req, res, next) => {
    if (req.body.image) {
        // Remove any non-base64 characters that could be malicious
        req.body.image = req.body.image.replace(/[^A-Za-z0-9+/=]/g, '');
    }
    next();
};
