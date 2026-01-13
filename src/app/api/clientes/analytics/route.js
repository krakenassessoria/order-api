// src/app/api/clientes/analytics/route.js
import { connectDB } from '../../../../lib/mongodb.js';
import { AnalyticsOrderModel } from '../../../../models/AnalyticsOrderModel.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

const PRODUCT_ALIASES = {
  navio: [
    'ckqz9ndug001t0zpauvnkcth4',
    'clwj6d50700b70jm51eopxdhk',
  ],
  boulevard: [
    'ckqz9q5xt003g0spai5a9suan',
    'ckrz0dkhe00b60zpj47esb8rv',
    'cl2mbkykw0bh110jx9zgl5h33',
  ],
  porto: [
    'ckq2trvr800250zlral88xgrz',
    'ckqz96nk1001f0zpaiwtw9jzx',
    'ckrxsidzv01nu0zqf4p4virrm',
    'clvxr6ygi02re0qqygbx51bzs',
    'cm1gtmpsw045r0qpslrn2fxuz',
  ],
};

const parseList = (param) => (param ? param.split(',').map(s => s.trim()).filter(Boolean) : []);
const toBool = (v) => v === '1' || v === 'true';

const assertDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function resolveProductIds(searchParams) {
  const aliasList = parseList(searchParams.get('product') || searchParams.get('products'))
    .map(s => s.toLowerCase());
  const explicitIds = parseList(searchParams.get('productIds'));
  const fromAliases = aliasList.flatMap(a => PRODUCT_ALIASES[a] || []);
  return [...new Set([...fromAliases, ...explicitIds])];
}

function labelForProductId(pid) {
  if (!pid) return '';
  for (const [label, ids] of Object.entries(PRODUCT_ALIASES)) {
    if (ids.includes(pid)) return label;
  }
  return 'outro';
}

export async function GET(req) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();

  let startDate = searchParams.get('startDate');
  let endDate = searchParams.get('endDate');
  const dateField = (searchParams.get('dateField') || 'userCreatedAt').toLowerCase();
  const estado = (searchParams.get('estado') || searchParams.get('state') || '').trim();
  const city = (searchParams.get('city') || '').trim();
  const cities = parseList(searchParams.get('cities'));
  const includeCustomers = toBool(searchParams.get('includeCustomers'));
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
  const top = Math.min(parseInt(searchParams.get('top') || '200', 10) || 200, 500);

  if (!startDate || !endDate) {
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    startDate = startDate || firstDay.toISOString().slice(0, 10);
    endDate = endDate || now.toISOString().slice(0, 10);
  }

  if ((startDate && !assertDate(startDate)) || (endDate && !assertDate(endDate))) {
    return new Response(JSON.stringify({ error: 'Datas devem estar no formato YYYY-MM-DD.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (dateField !== 'createdat' && dateField !== 'reservationdate' && dateField !== 'usercreatedat') {
    return new Response(JSON.stringify({ error: 'dateField deve ser createdAt, reservationDate ou userCreatedAt.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const productIds = resolveProductIds(searchParams);

  const useCreatedAt = dateField === 'createdat';
  const useUserCreatedAt = dateField === 'usercreatedat';

  const ordersMatch = {};

  if (!useUserCreatedAt && startDate && endDate) {
    if (useCreatedAt) {
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T23:59:59.999Z`);
      ordersMatch.createdAt = { $gte: start, $lte: end };
    } else {
      ordersMatch.reservationDate = { $gte: startDate, $lte: endDate };
    }
  } else if (!useUserCreatedAt && startDate) {
    if (useCreatedAt) {
      const start = new Date(`${startDate}T00:00:00.000Z`);
      ordersMatch.createdAt = { $gte: start };
    } else {
      ordersMatch.reservationDate = { $gte: startDate };
    }
  } else if (!useUserCreatedAt && endDate) {
    if (useCreatedAt) {
      const end = new Date(`${endDate}T23:59:59.999Z`);
      ordersMatch.createdAt = { $lte: end };
    } else {
      ordersMatch.reservationDate = { $lte: endDate };
    }
  }

  if (productIds.length) {
    ordersMatch.productsId = { $in: productIds };
  }

  if (estado && estado !== 'todos') {
    ordersMatch.userStateNorm = estado.toUpperCase();
  }
  if (city) {
    ordersMatch.userCityNorm = city.trim().toUpperCase();
  } else if (cities.length) {
    ordersMatch.userCityNorm = { $in: cities.map(c => c.trim().toUpperCase()) };
  }

  if (useUserCreatedAt) {
    if (startDate) {
      const start = new Date(`${startDate}T00:00:00.000Z`);
      ordersMatch.userCreatedAt = { ...(ordersMatch.userCreatedAt || {}), $gte: start };
    }
    if (endDate) {
      const end = new Date(`${endDate}T23:59:59.999Z`);
      ordersMatch.userCreatedAt = { ...(ordersMatch.userCreatedAt || {}), $lte: end };
    }
  }

  const basePipeline = [
    { $match: ordersMatch },
    {
      $group: {
        _id: '$buyerId',
        orderCount: { $sum: 1 },
        firstOrderDate: { $min: '$createdAt' },
        lastOrderDate: { $max: '$createdAt' },
        productsIds: { $addToSet: '$productsId' },
        userCity: { $first: '$userCity' },
        userState: { $first: '$userState' },
        userCityNorm: { $first: '$userCityNorm' },
        userStateNorm: { $first: '$userStateNorm' },
        birthDateNormalized: { $first: '$birthDateNormalized' },
        userCreatedAt: { $first: '$userCreatedAt' },
        userName: { $first: '$userName' },
        userEmail: { $first: '$userEmail' },
        userPhone: { $first: '$userPhone' },
      }
    },
    { $match: { _id: { $ne: null } } },
    {
      $addFields: {
        birthDateNormalized: '$birthDateNormalized',
      }
    },
    {
      $addFields: {
        ageYears: {
          $cond: [
            { $ne: ['$birthDateNormalized', null] },
            {
              $subtract: [
                { $subtract: [nowYear, { $year: '$birthDateNormalized' }] },
                {
                  $cond: [
                    {
                      $or: [
                        { $lt: [{ $month: '$birthDateNormalized' }, nowMonth] },
                        {
                          $and: [
                            { $eq: [{ $month: '$birthDateNormalized' }, nowMonth] },
                            { $lte: [{ $dayOfMonth: '$birthDateNormalized' }, nowDay] }
                          ]
                        }
                      ]
                    },
                    0,
                    1
                  ]
                }
              ]
            },
            null
          ]
        },
      }
    },
    {
      $addFields: {
        ageRange: {
          $switch: {
            branches: [
              { case: { $and: [{ $ne: ['$ageYears', null] }, { $lt: ['$ageYears', 18] }] }, then: '0-17' },
              { case: { $and: [{ $gte: ['$ageYears', 18] }, { $lte: ['$ageYears', 29] }] }, then: '18-29' },
              { case: { $and: [{ $gte: ['$ageYears', 30] }, { $lte: ['$ageYears', 39] }] }, then: '30-39' },
              { case: { $and: [{ $gte: ['$ageYears', 40] }, { $lte: ['$ageYears', 49] }] }, then: '40-49' },
              { case: { $and: [{ $gte: ['$ageYears', 50] }, { $lte: ['$ageYears', 59] }] }, then: '50-59' },
              { case: { $and: [{ $gte: ['$ageYears', 60] }, { $lte: ['$ageYears', 69] }] }, then: '60-69' },
              { case: { $gte: ['$ageYears', 70] }, then: '70+' },
            ],
            default: 'Sem idade'
          }
        },
        freqRange: {
          $switch: {
            branches: [
              { case: { $eq: ['$orderCount', 1] }, then: '1' },
              { case: { $and: [{ $gte: ['$orderCount', 2] }, { $lte: ['$orderCount', 3] }] }, then: '2-3' },
              { case: { $and: [{ $gte: ['$orderCount', 4] }, { $lte: ['$orderCount', 5] }] }, then: '4-5' },
              { case: { $and: [{ $gte: ['$orderCount', 6] }, { $lte: ['$orderCount', 9] }] }, then: '6-9' },
            ],
            default: '10+'
          }
        },
      }
    },
    {
      $project: {
        customerId: '$_id',
        orderCount: 1,
        firstOrderDate: 1,
        lastOrderDate: 1,
        productsIds: 1,
        user: {
          city: '$userCity',
          state: '$userState',
          createdAt: '$userCreatedAt',
          name: '$userName',
          email: '$userEmail',
          phone: '$userPhone',
        },
        birthDateNormalized: 1,
        ageYears: 1,
        ageRange: 1,
        freqRange: 1,
        userCityNorm: 1,
        userStateNorm: 1,
      }
    },
  ];

  const facets = {
    overview: [
      {
        $group: {
          _id: null,
          customers: { $sum: 1 },
          totalOrders: { $sum: '$orderCount' },
          avgOrdersPerCustomer: { $avg: '$orderCount' },
        }
      }
    ],
    byCity: [
      {
        $group: {
          _id: {
            city: '$userCityNorm',
            state: '$userStateNorm',
          },
          customers: { $sum: 1 },
          avgOrders: { $avg: '$orderCount' },
        }
      },
      { $sort: { customers: -1 } },
      { $limit: top },
      {
        $project: {
          _id: 0,
          city: '$_id.city',
          state: '$_id.state',
          customers: 1,
          avgOrders: 1,
        }
      }
    ],
    byState: [
      {
        $group: {
          _id: { state: '$userStateNorm' },
          customers: { $sum: 1 },
          avgOrders: { $avg: '$orderCount' },
        }
      },
      { $sort: { customers: -1 } },
      {
        $project: {
          _id: 0,
          state: '$_id.state',
          customers: 1,
          avgOrders: 1,
        }
      }
    ],
    ageRanges: [
      {
        $group: {
          _id: '$ageRange',
          customers: { $sum: 1 },
        }
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, range: '$_id', customers: 1 } }
    ],
    purchaseFrequency: [
      {
        $group: {
          _id: '$freqRange',
          customers: { $sum: 1 },
        }
      },
      {
        $addFields: {
          sortKey: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', '1'] }, then: 1 },
                { case: { $eq: ['$_id', '2-3'] }, then: 2 },
                { case: { $eq: ['$_id', '4-5'] }, then: 3 },
                { case: { $eq: ['$_id', '6-9'] }, then: 4 },
                { case: { $eq: ['$_id', '10+'] }, then: 5 },
              ],
              default: 99
            }
          }
        }
      },
      { $sort: { sortKey: 1 } },
      { $project: { _id: 0, range: '$_id', customers: 1 } }
    ],
    customersByYearMonth: [
      {
        $addFields: {
          userCreatedAtObj: {
            $cond: [
              { $eq: [{ $type: '$userCreatedAt' }, 'date'] },
              '$userCreatedAt',
              null
            ]
          }
        }
      },
      { $match: { userCreatedAtObj: { $ne: null } } },
      {
        $group: {
          _id: {
            year: { $year: '$userCreatedAtObj' },
            month: { $month: '$userCreatedAtObj' },
          },
          customers: { $sum: 1 },
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month', customers: 1 } }
    ],
    productsBreakdown: [
      { $unwind: '$productsIds' },
      {
        $group: {
          _id: '$productsIds',
          customers: { $sum: 1 },
        }
      },
      { $sort: { customers: -1 } },
      { $project: { _id: 0, productId: '$_id', customers: 1 } }
    ],
  };

  if (includeCustomers) {
    facets.customers = [
      { $sort: { lastOrderDate: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          customerId: 1,
          name: { $ifNull: ['$userName', ''] },
          email: { $ifNull: ['$userEmail', ''] },
          phone: { $ifNull: ['$userPhone', ''] },
          city: { $ifNull: ['$userCity', ''] },
          state: { $ifNull: ['$userState', ''] },
          birthDate: '$birthDateNormalized',
          ageYears: 1,
          ageRange: 1,
          orderCount: 1,
          firstOrderDate: 1,
          lastOrderDate: 1,
          productsIds: 1,
        }
      }
    ];

    facets.totalCustomers = [
      { $count: 'count' }
    ];
  }

  try {
    const [customerStats] = await AnalyticsOrderModel.aggregate([
      ...basePipeline,
      { $facet: facets },
    ]).allowDiskUse(true);

    const ordersByMonthMatch = {};

    if (productIds.length) {
      ordersByMonthMatch.productsId = { $in: productIds };
    }
    if (estado && estado !== 'todos') {
      ordersByMonthMatch.userStateNorm = estado.toUpperCase();
    }
    if (city) {
      ordersByMonthMatch.userCityNorm = city.trim().toUpperCase();
    } else if (cities.length) {
      ordersByMonthMatch.userCityNorm = { $in: cities.map(c => c.trim().toUpperCase()) };
    }
    if (startDate || endDate) {
      const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
      const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;
      ordersByMonthMatch.createdAt = {
        ...(start ? { $gte: start } : {}),
        ...(end ? { $lte: end } : {}),
      };
    }

    const ordersByYearMonth = await AnalyticsOrderModel.aggregate([
      { $match: ordersByMonthMatch },
      {
        $addFields: {
          reservationDateObj: {
            $switch: {
              branches: [
                { case: { $eq: [{ $type: '$createdAt' }, 'date'] }, then: '$createdAt' },
              ],
              default: null
            }
          }
        }
      },
      { $match: { reservationDateObj: { $ne: null } } },
      {
        $group: {
          _id: {
            year: { $year: '$reservationDateObj' },
            month: { $month: '$reservationDateObj' },
          },
          orders: { $sum: 1 },
          uniqueCustomers: { $addToSet: '$buyerId' },
        }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          orders: 1,
          customers: { $size: '$uniqueCustomers' },
        }
      },
      { $sort: { year: 1, month: 1 } },
    ]).allowDiskUse(true);

    const overview = customerStats?.overview?.[0] || {
      customers: 0,
      totalOrders: 0,
      avgOrdersPerCustomer: 0,
    };

    const productsBreakdown = (customerStats?.productsBreakdown || []).map((row) => ({
      ...row,
      productLabel: labelForProductId(row.productId),
    }));

    const response = {
      filters: {
        startDate,
        endDate,
        dateField: useUserCreatedAt ? 'userCreatedAt' : (useCreatedAt ? 'createdAt' : 'reservationDate'),
        state: estado || null,
        city: city || null,
        cities: cities.length ? cities : null,
        productIds: productIds.length ? productIds : null,
      },
      overview,
      byCity: customerStats?.byCity || [],
      byState: customerStats?.byState || [],
      ageRanges: customerStats?.ageRanges || [],
      purchaseFrequency: customerStats?.purchaseFrequency || [],
      customersByYearMonth: customerStats?.customersByYearMonth || [],
      ordersByYearMonth,
      productsBreakdown,
    };

    if (includeCustomers) {
      const total = customerStats?.totalCustomers?.[0]?.count || 0;
      response.pagination = {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      };
      response.customers = (customerStats?.customers || []).map((row) => ({
        ...row,
        products: (row.productsIds || []).map(labelForProductId),
      }));
    }

    return Response.json(response);
  } catch (err) {
    console.error('[/api/clientes/analytics] err:', err);
    return new Response(JSON.stringify({ error: 'Falha ao gerar analytics', detail: err?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
