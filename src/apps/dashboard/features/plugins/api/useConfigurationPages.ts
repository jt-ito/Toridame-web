import type { Api } from '@jellyfin/sdk';
import type { PluginApiGetConfigurationPagesRequest } from '@jellyfin/sdk/lib/generated-client/api/plugin-api';
import { getPluginApi } from '@jellyfin/sdk/lib/utils/api/plugin-api';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

import { useApi } from 'hooks/useApi';

import { QueryKey } from './queryKey';

const fetchConfigurationPages = async (
    api: Api,
    params?: PluginApiGetConfigurationPagesRequest,
    options?: AxiosRequestConfig
) => {
    const response = await getPluginApi(api)
        .getConfigurationPages(params, options);

    // This route lives under /web/, so a proxy or CDN serving the web client can answer it with a page
    // instead of JSON. Callers map over the result, and that would take down the whole dashboard.
    if (!Array.isArray(response.data)) {
        throw new Error('Unexpected response from /web/ConfigurationPages, expected a list of pages');
    }

    return response.data;
};

const getConfigurationPagesQuery = (
    api?: Api,
    params?: PluginApiGetConfigurationPagesRequest
) => queryOptions({
    queryKey: [ QueryKey.ConfigurationPages, params?.enableInMainMenu ],
    queryFn: ({ signal }) => fetchConfigurationPages(api!, params, { signal }),
    enabled: !!api
});

export const useConfigurationPages = (
    params?: PluginApiGetConfigurationPagesRequest
) => {
    const { api } = useApi();
    return useQuery(getConfigurationPagesQuery(api, params));
};
