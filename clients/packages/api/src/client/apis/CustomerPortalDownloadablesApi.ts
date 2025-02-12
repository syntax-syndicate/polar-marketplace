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
  BenefitIDFilter3,
  HTTPValidationError,
  ListResourceDownloadableRead,
  OrganizationIDFilter1,
} from '../models/index';

export interface CustomerPortalDownloadablesApiCustomerPortalDownloadablesGetRequest {
    token: string;
}

export interface CustomerPortalDownloadablesApiListRequest {
    organizationId?: OrganizationIDFilter1 | null;
    benefitId?: BenefitIDFilter3 | null;
    page?: number;
    limit?: number;
}

/**
 * 
 */
export class CustomerPortalDownloadablesApi extends runtime.BaseAPI {

    /**
     * Get Downloadable
     */
    async customerPortalDownloadablesGetRaw(requestParameters: CustomerPortalDownloadablesApiCustomerPortalDownloadablesGetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<any>> {
        if (requestParameters['token'] == null) {
            throw new runtime.RequiredError(
                'token',
                'Required parameter "token" was null or undefined when calling customerPortalDownloadablesGet().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        const response = await this.request({
            path: `/v1/customer-portal/downloadables/{token}`.replace(`{${"token"}}`, encodeURIComponent(String(requestParameters['token']))),
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        if (this.isJsonMime(response.headers.get('content-type'))) {
            return new runtime.JSONApiResponse<any>(response);
        } else {
            return new runtime.TextApiResponse(response) as any;
        }
    }

    /**
     * Get Downloadable
     */
    async customerPortalDownloadablesGet(requestParameters: CustomerPortalDownloadablesApiCustomerPortalDownloadablesGetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<any> {
        const response = await this.customerPortalDownloadablesGetRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * List Downloadables
     */
    async listRaw(requestParameters: CustomerPortalDownloadablesApiListRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListResourceDownloadableRead>> {
        const queryParameters: any = {};

        if (requestParameters['organizationId'] != null) {
            queryParameters['organization_id'] = requestParameters['organizationId'];
        }

        if (requestParameters['benefitId'] != null) {
            queryParameters['benefit_id'] = requestParameters['benefitId'];
        }

        if (requestParameters['page'] != null) {
            queryParameters['page'] = requestParameters['page'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
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
            path: `/v1/customer-portal/downloadables/`,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        }, initOverrides);

        return new runtime.JSONApiResponse(response);
    }

    /**
     * List Downloadables
     */
    async list(requestParameters: CustomerPortalDownloadablesApiListRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListResourceDownloadableRead> {
        const response = await this.listRaw(requestParameters, initOverrides);
        return await response.value();
    }

}
