// src/app/api/analytics/rebuild/route.js
import { connectDB } from '@/lib/mongodb';
import { OrderModel } from '@/models/OrderModel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

const trimDateString = (path) => ({
  $trim: {
    input: {
      $substrBytes: [{ $toString: path }, 0, 10]
    }
  }
});

export async function GET(req) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const now = new Date();

  const token = searchParams.get('token') || req.headers.get('x-analytics-token');
  if (!process.env.ANALYTICS_JOB_TOKEN || token !== process.env.ANALYTICS_JOB_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const pipeline = [
      { $match: { type: 'order', status: 'success' } },
      {
        $lookup: {
          from: 'aposDocs',
          let: { buyerId: '$buyerId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$buyerId'] }, type: 'apostrophe-user' } },
            {
              $project: {
                title: 1,
                username: 1,
                email: 1,
                phoneNumber: 1,
                phone: 1,
                city: 1,
                state: 1,
                birthDate: 1,
                birthdate: 1,
                createdAt: 1,
              }
            }
          ],
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          userCityNorm: {
            $trim: {
              input: { $toUpper: { $ifNull: ['$user.city', 'Sem cidade'] } }
            }
          },
          userStateNorm: {
            $trim: {
              input: { $toUpper: { $ifNull: ['$user.state', 'Sem estado'] } }
            }
          },
          birthDateNormalized: {
            $let: {
              vars: {
                bdRaw: { $ifNull: ['$user.birthDate', '$user.birthdate'] },
                bdType: { $type: { $ifNull: ['$user.birthDate', '$user.birthdate'] } },
                bdStr: trimDateString({ $ifNull: ['$user.birthDate', '$user.birthdate'] }),
                slashPos: { $indexOfBytes: [trimDateString({ $ifNull: ['$user.birthDate', '$user.birthdate'] }), '/'] },
                dashPos: { $indexOfBytes: [trimDateString({ $ifNull: ['$user.birthDate', '$user.birthdate'] }), '-'] },
              },
              in: {
                $cond: [
                  { $eq: ['$$bdType', 'date'] },
                  '$$bdRaw',
                  {
                    $cond: [
                      { $gte: ['$$slashPos', 0] },
                      {
                        $dateFromString: {
                          dateString: '$$bdStr',
                          format: '%d/%m/%Y',
                          onError: null,
                          onNull: null,
                        }
                      },
                      {
                        $cond: [
                          { $gte: ['$$dashPos', 0] },
                          {
                            $dateFromString: {
                              dateString: '$$bdStr',
                              format: '%Y-%m-%d',
                              onError: null,
                              onNull: null,
                            }
                          },
                          null
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          },
        }
      },
      {
        $project: {
          _id: 1,
          buyerId: 1,
          productsId: 1,
          reservationDate: 1,
          createdAt: 1,
          userCreatedAt: '$user.createdAt',
          birthDateNormalized: 1,
          userCity: '$user.city',
          userState: '$user.state',
          userCityNorm: 1,
          userStateNorm: 1,
          userName: { $ifNull: ['$user.title', '$user.username'] },
          userEmail: '$user.email',
          userPhone: { $ifNull: ['$user.phoneNumber', '$user.phone'] },
          updatedAt: now,
        }
      },
      {
        $merge: {
          into: 'analyticsOrders',
          on: '_id',
          whenMatched: 'replace',
          whenNotMatched: 'insert',
        }
      }
    ];

    await OrderModel.aggregate(pipeline).allowDiskUse(true);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[/api/analytics/rebuild] err:', err);
    return new Response(JSON.stringify({ error: 'Falha ao rebuild analytics', detail: err?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
