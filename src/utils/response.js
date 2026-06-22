'use strict';

const success = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data = {}, message = 'Created') =>
  success(res, data, message, 201);

const error = (res, message = 'Something went wrong', statusCode = 500, errors = null) =>
  res.status(statusCode).json({ success: false, message, ...(errors && { errors }) });

const badRequest  = (res, msg, errs)  => error(res, msg, 400, errs);
const unauthorized = (res, msg = 'Unauthorized') => error(res, msg, 401);
const forbidden   = (res, msg = 'Forbidden')     => error(res, msg, 403);
const notFound    = (res, msg = 'Not found')     => error(res, msg, 404);
const conflict    = (res, msg = 'Conflict')      => error(res, msg, 409);

const paginated = (res, data, total, page, limit, message = 'Success') =>
  res.status(200).json({
    success: true, message,
    data,
    pagination: {
      total,
      page:       parseInt(page, 10),
      limit:      parseInt(limit, 10),
      totalPages: Math.ceil(total / limit),
      hasNext:    page * limit < total,
      hasPrev:    page > 1,
    },
  });

module.exports = { success, created, error, badRequest, unauthorized, forbidden, notFound, conflict, paginated };
