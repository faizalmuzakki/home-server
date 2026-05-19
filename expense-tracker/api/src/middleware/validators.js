import { body, param, query, validationResult } from 'express-validator';

// Middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
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
        .notEmpty().withMessage('Amount is required')
        .isNumeric().withMessage('Amount must be a number')
        .custom(val => parseFloat(val) > 0).withMessage('Amount must be positive'),
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
    body('type')
        .optional({ nullable: true })
        .isIn(['expense', 'income']).withMessage('Type must be "expense" or "income"'),
    body('source')
        .optional({ nullable: true }),
    body('image_url')
        .optional({ nullable: true }),
    body('raw_text')
        .optional({ nullable: true }),
    handleValidationErrors,
];

export const updateExpenseValidators = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid expense ID'),
    body('amount')
        .optional({ nullable: true })
        .isNumeric().withMessage('Amount must be a number'),
    body('date')
        .optional({ nullable: true }),
    body('description')
        .optional({ nullable: true }),
    body('vendor')
        .optional({ nullable: true }),
    body('category_id')
        .optional({ nullable: true }),
    body('type')
        .optional({ nullable: true })
        .isIn(['expense', 'income']).withMessage('Type must be "expense" or "income"'),
    handleValidationErrors,
];

export const getExpenseValidators = [
    param('id')
        .isInt({ min: 1 }).withMessage('Invalid expense ID'),
    handleValidationErrors,
];

export const listExpenseValidators = [
    // Made completely permissive - let the route handler deal with validation
    // This prevents breaking the frontend with strict validation
    handleValidationErrors,
];

// Parse validators
export const parseTextValidators = [
    body('text')
        .notEmpty().withMessage('Text is required')
        .isString().withMessage('Text must be a string')
        .isLength({ max: 2000 }).withMessage('Text too long (max 2000 chars)'),
    handleValidationErrors,
];

export const parseImageValidators = [
    body('image')
        .notEmpty().withMessage('Image is required')
        .isString().withMessage('Image must be a base64 string'),
    handleValidationErrors,
];

// Upload validators
export const uploadValidators = [
    body('image')
        .notEmpty().withMessage('Image is required')
        .isString().withMessage('Image must be a base64 string'),
    body('filename')
        .optional({ nullable: true }),
    handleValidationErrors,
];

// Sanitize base64 image - remove potential script injections
export const sanitizeBase64Image = (req, res, next) => {
    if (req.body.image && typeof req.body.image === 'string') {
        // Remove any non-base64 characters that could be malicious
        req.body.image = req.body.image.replace(/[^A-Za-z0-9+/=]/g, '');
    }
    next();
};

// Calorie entry validators
export const createCalorieValidators = [
    body('sender_id')
        .notEmpty().withMessage('sender_id is required')
        .isString().withMessage('sender_id must be a string')
        .isLength({ max: 64 }).withMessage('sender_id too long (max 64 chars)'),
    body('sender_name')
        .optional({ nullable: true })
        .isString().withMessage('sender_name must be a string')
        .isLength({ max: 128 }).withMessage('sender_name too long (max 128 chars)'),
    body('description')
        .optional({ nullable: true })
        .isString().withMessage('description must be a string')
        .isLength({ max: 500 }).withMessage('description too long (max 500 chars)'),
    body('calories')
        .notEmpty().withMessage('calories is required')
        .isNumeric().withMessage('calories must be a number')
        .custom(v => parseFloat(v) > 0 && parseFloat(v) <= 20000)
        .withMessage('calories must be between 1 and 20000'),
    body('protein_g').optional({ nullable: true }).isNumeric().withMessage('protein_g must be a number'),
    body('carbs_g').optional({ nullable: true }).isNumeric().withMessage('carbs_g must be a number'),
    body('fat_g').optional({ nullable: true }).isNumeric().withMessage('fat_g must be a number'),
    body('confidence').optional({ nullable: true }).isFloat({ min: 0, max: 1 }).withMessage('confidence must be 0-1'),
    body('items')
        .optional({ nullable: true })
        .isArray({ max: 30 }).withMessage('items must be an array (max 30)'),
    body('image_url').optional({ nullable: true }).isString().isLength({ max: 300 }),
    body('date')
        .notEmpty().withMessage('date is required')
        .isString().withMessage('date must be a string')
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
    handleValidationErrors,
];

export const listCalorieValidators = [
    handleValidationErrors,
];

