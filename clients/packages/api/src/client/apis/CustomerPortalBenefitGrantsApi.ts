/* tslint:disable */
/* eslint-disable */
/**
 * Polar API
 * Read the docs at https://docs.polar.sh/api-reference
 *
 * The version of the OpenAPI document: 0.1.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */


import * as runtime from '../runtime';
import type {
  BenefitIDFilter2,
  BenefitTypeFilter,
  CheckoutIDFilter1,
  CustomerBenefitGrant,
  CustomerBenefitGrantSortProperty,
  CustomerBenefitGrantUpdate,
  HTTPValidationError,
  ListResourceCustomerBenefitGrant,
  NotPermitted,
  OrderIDFilter,
  OrganizationIDFilter1,
  ResourceNotFound,
  SubscriptionIDFilter,
} from '../models/index';

export interface CustomerPortalBenefitGrantsApiGetRequest {
    id: string;
}

export interface CustomerPortalBenefitGrantsApiListRequest {
    type?: BenefitTypeFilter | null;
    benefitId?: BenefitIDFilter2 | null;
    organizationId?: OrganizationIDFilter1 | null;
    checkoutId?: CheckoutIDFilter1 | null;
    orderId?: OrderIDFilter | null;
    subscriptionId?: SubscriptionIDFilter | null;
    page?: number;
    limit?: number;
    sorting?: Array<CustomerBenefitGrantSortProperty> | null;
}

export interface CustomerPortalBenefitGrantsApiUpdateRequest {
    id: string;
    body: CustomerBenefitGrantUpdate;
}

/**
 * 
 */
export class CustomerPortalBenefitGrantsApi extends runtime.BaseAPI {

    /**
     * Get a benefit grant by ID for the authenticated customer or user.
     * Get Benefit Grant
     */
    async getRaw(requestParameters: CustomerPortalBenefitGrantsApiGetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<CustomerBenefitGrant>> {
        if (requestParameters['id'] == null) {
            throw new runtime.RequiredError(
                'id',
                'Required parameter "id" was null or undefined when calling get().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("pat", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("oat", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("customer_session", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        const response = await this.request({
            path: `/v1/customer-portal/benefit-grants/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters['id']))),
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response);
    }

    /**
     * Get a benefit grant by ID for the authenticated customer or user.
     * Get Benefit Grant
     */
    async get(requestParameters: CustomerPortalBenefitGrantsApiGetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<CustomerBenefitGrant> {
        const response = await this.getRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * List benefits grants of the authenticated customer or user.
     * List Benefit Grants
     */
    async listRaw(requestParameters: CustomerPortalBenefitGrantsApiListRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListResourceCustomerBenefitGrant>> {
        const queryParameters: any = {};

        if (requestParameters['type'] != null) {
            queryParameters['type'] = requestParameters['type'];
        }

        if (requestParameters['benefitId'] != null) {
            queryParameters['benefit_id'] = requestParameters['benefitId'];
        }

        if (requestParameters['organizationId'] != null) {
            queryParameters['organization_id'] = requestParameters['organizationId'];
        }

        if (requestParameters['checkoutId'] != null) {
            queryParameters['checkout_id'] = requestParameters['checkoutId'];
        }

        if (requestParameters['orderId'] != null) {
            queryParameters['order_id'] = requestParameters['orderId'];
        }

        if (requestParameters['subscriptionId'] != null) {
            queryParameters['subscription_id'] = requestParameters['subscriptionId'];
        }

        if (requestParameters['page'] != null) {
            queryParameters['page'] = requestParameters['page'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['sorting'] != null) {
            queryParameters['sorting'] = requestParameters['sorting'];
        }

        const headerParameters: runtime.HTTPHeaders = {};

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("pat", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("oat", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("customer_session", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        const response = await this.request({
            path: `/v1/customer-portal/benefit-grants/`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response);
    }

    /**
     * List benefits grants of the authenticated customer or user.
     * List Benefit Grants
     */
    async list(requestParameters: CustomerPortalBenefitGrantsApiListRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListResourceCustomerBenefitGrant> {
        const response = await this.listRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Update a benefit grant for the authenticated customer or user.
     * Update Benefit Grant
     */
    async updateRaw(requestParameters: CustomerPortalBenefitGrantsApiUpdateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<CustomerBenefitGrant>> {
        if (requestParameters['id'] == null) {
            throw new runtime.RequiredError(
                'id',
                'Required parameter "id" was null or undefined when calling update().'
            );
        }

        if (requestParameters['body'] == null) {
            throw new runtime.RequiredError(
                'body',
                'Required parameter "body" was null or undefined when calling update().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("pat", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("oat", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("customer_session", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }
        const response = await this.request({
            path: `/v1/customer-portal/benefit-grants/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters['id']))),
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: requestParameters['body'],
        }, initOverrides);

        return new runtime.JSONApiResponse(response);
    }

    /**
     * Update a benefit grant for the authenticated customer or user.
     * Update Benefit Grant
     */
    async update(requestParameters: CustomerPortalBenefitGrantsApiUpdateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<CustomerBenefitGrant> {
        const response = await this.updateRaw(requestParameters, initOverrides);
        return await response.value();
    }

}
