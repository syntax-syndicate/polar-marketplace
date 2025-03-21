from uuid import UUID

from fastapi import Depends, HTTPException, Query

from polar.auth.dependencies import WebUser, WebUserOrAnonymous
from polar.authz.service import AccessType, Authz
from polar.currency.schemas import CurrencyAmount
from polar.exceptions import ResourceNotFound, Unauthorized
from polar.issue.service import issue as issue_service
from polar.kit.pagination import ListResource, Pagination
from polar.models.issue_reward import IssueReward
from polar.models.pledge import Pledge as PledgeModel
from polar.models.pledge_transaction import PledgeTransaction as PledgeTransactionModel
from polar.openapi import APITag
from polar.organization.schemas import Organization as OrganizationSchema
from polar.pledge.schemas import Pledge
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter
from polar.user.schemas.user import User

from .schemas import Reward, RewardsSummary, RewardsSummaryReceiver, RewardState
from .service import reward_service

router = APIRouter(tags=["rewards", APITag.private])


@router.get(
    "/rewards/search",
    response_model=ListResource[Reward],
    description="Search rewards.",
    summary="Search rewards",
    status_code=200,
)
async def search(
    auth_subject: WebUser,
    pledges_to_organization: UUID | None = Query(
        default=None,
        description="Search rewards for pledges in this organization.",  # noqa: E501
    ),
    rewards_to_user: UUID | None = Query(
        default=None,
        description="Search rewards to user.",
    ),
    rewards_to_org: UUID | None = Query(
        default=None,
        description="Search rewards to organization.",
    ),
    session: AsyncSession = Depends(get_db_session),
    authz: Authz = Depends(Authz.authz),
) -> ListResource[Reward]:
    if not pledges_to_organization and not rewards_to_user and not rewards_to_org:
        raise HTTPException(
            status_code=401,
            detail="One of pledges_to_organization, rewards_to_user or rewards_to_org must be set",  # noqa: E501
        )

    rewards = await reward_service.list(
        session,
        pledge_org_id=pledges_to_organization,
        reward_user_id=rewards_to_user,
        reward_org_id=rewards_to_org,
    )

    items = [
        to_resource(
            pledge,
            reward,
            transaction,
            include_receiver_admin_fields=await authz.can(
                auth_subject.subject, AccessType.write, pledge
            ),
        )
        for pledge, reward, transaction in rewards
        if await authz.can(auth_subject.subject, AccessType.read, reward)
    ]

    return ListResource(
        items=items, pagination=Pagination(total_count=len(items), max_page=1)
    )


def to_resource(
    pledge: PledgeModel,
    reward: IssueReward,
    transaction: PledgeTransactionModel,
    *,
    include_receiver_admin_fields: bool = False,
    include_sender_admin_fields: bool = False,
    include_sender_fields: bool = False,
) -> Reward:
    user = None
    if reward and reward.user:
        user = User(
            public_name=reward.user.public_name, avatar_url=reward.user.avatar_url
        )
    elif reward.github_username:
        user = User(public_name=reward.github_username, avatar_url=None)

    organization = None
    if reward.organization:
        organization = OrganizationSchema.model_validate(reward.organization)

    amount = CurrencyAmount(currency="USD", amount=0)
    if transaction and transaction.amount:
        amount = CurrencyAmount(currency="USD", amount=transaction.amount)
    else:
        amount = CurrencyAmount(currency="USD", amount=reward.get_share_amount(pledge))

    return Reward(
        pledge=Pledge.from_db(
            pledge,
            include_receiver_admin_fields=include_receiver_admin_fields,
            include_sender_admin_fields=include_sender_admin_fields,
            include_sender_fields=include_sender_fields,
        ),
        user=user,
        organization=organization,
        amount=amount,
        state=RewardState.paid if transaction else RewardState.pending,
        paid_at=transaction.created_at if transaction else None,
    )


@router.get(
    "/rewards/summary",
    response_model=RewardsSummary,
    description="Get summary of rewards for resource.",  # noqa: E501
    summary="Get rewards summary",
    status_code=200,
)
async def summary(
    issue_id: UUID,
    auth_subject: WebUserOrAnonymous,
    session: AsyncSession = Depends(get_db_session),
    authz: Authz = Depends(Authz.authz),
) -> RewardsSummary:
    issue = await issue_service.get(session, issue_id)
    if not issue:
        raise ResourceNotFound()

    if not await authz.can(auth_subject.subject, AccessType.read, issue):
        raise Unauthorized()

    rewards = await reward_service.list(session, issue_id=issue_id)

    rewarded_users_orgs: set[UUID] = set()
    rewarded_usernames: set[str] = set()
    res: list[RewardsSummaryReceiver] = []

    for pledge, reward, transaction in rewards:
        if reward.user_id:
            if reward.user_id in rewarded_users_orgs:
                continue
            rewarded_users_orgs.add(reward.user_id)
            res.append(
                RewardsSummaryReceiver(
                    name=reward.user.public_name,
                    avatar_url=reward.user.avatar_url,
                )
            )
            continue

        if reward.organization_id:
            if reward.organization_id in rewarded_users_orgs:
                continue
            rewarded_users_orgs.add(reward.organization_id)
            res.append(
                RewardsSummaryReceiver(
                    name=reward.organization.slug,
                    avatar_url=reward.organization.avatar_url,
                )
            )
            continue

        if reward.github_username:
            if reward.github_username in rewarded_usernames:
                continue
            rewarded_usernames.add(reward.github_username)
            res.append(
                RewardsSummaryReceiver(
                    name=reward.github_username,
                    avatar_url=None,
                )
            )
            continue

    return RewardsSummary(receivers=res)
