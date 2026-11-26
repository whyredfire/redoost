-- The schema as the last Alembic migration (3caf283cca3f) left it, from pg_dump --schema-only.
-- Databases the Python API migrated already have it, so they only drop Alembic's table.
DO $$
BEGIN
    IF to_regclass('public.alembic_version') IS NOT NULL THEN
        IF NOT EXISTS (SELECT FROM public.alembic_version WHERE version_num = '3caf283cca3f') THEN
            RAISE EXCEPTION 'The database is not at Alembic revision 3caf283cca3f; '
                'migrate it with redoost 0.6.2 first';
        END IF;
        DROP TABLE public.alembic_version;
    ELSE
        CREATE TYPE public.deploymentstate AS ENUM (
            'uploading',
            'ready'
        );

        CREATE TYPE public.provider AS ENUM (
            'google'
        );

        CREATE TYPE public.tokensource AS ENUM (
            'cli',
            'manual'
        );

        CREATE TABLE public.api_token (
            id character varying NOT NULL,
            name character varying NOT NULL,
            secret_hash character varying NOT NULL,
            user_id character varying NOT NULL,
            source public.tokensource NOT NULL,
            scopes jsonb NOT NULL,
            created_at timestamp with time zone NOT NULL,
            last_used_at timestamp with time zone,
            expires_at timestamp with time zone
        );

        CREATE TABLE public.cli_login (
            id character varying NOT NULL,
            secret_hash character varying NOT NULL,
            user_id character varying,
            expires_at timestamp with time zone NOT NULL
        );

        CREATE TABLE public.deployment (
            slug character varying NOT NULL,
            state public.deploymentstate NOT NULL,
            file_count integer NOT NULL,
            total_size bigint NOT NULL,
            spa boolean NOT NULL,
            created_at timestamp with time zone NOT NULL,
            locked_until timestamp with time zone CONSTRAINT deployment_expires_at_not_null NOT NULL,
            owner_id character varying NOT NULL,
            enabled boolean DEFAULT true NOT NULL,
            description character varying(200) DEFAULT ''::character varying NOT NULL,
            folder character varying,
            pending_folder character varying,
            pending_size bigint DEFAULT '0'::bigint NOT NULL,
            pending_digest character varying,
            storage_size bigint NOT NULL,
            version_count integer NOT NULL,
            expires_at timestamp with time zone
        );

        CREATE TABLE public.discarded_folder (
            folder character varying NOT NULL,
            owner_id character varying NOT NULL,
            size bigint NOT NULL,
            delete_after timestamp with time zone NOT NULL
        );

        CREATE TABLE public.slug_offer (
            slug character varying NOT NULL,
            user_id character varying NOT NULL,
            expires_at timestamp with time zone NOT NULL
        );

        CREATE TABLE public.users (
            id character varying NOT NULL,
            provider public.provider NOT NULL,
            email character varying,
            name character varying,
            subject character varying NOT NULL,
            created_at timestamp with time zone NOT NULL,
            picture character varying
        );

        CREATE TABLE public.version (
            folder character varying NOT NULL,
            slug character varying NOT NULL,
            created_at timestamp with time zone NOT NULL,
            retired_at timestamp with time zone,
            file_count integer NOT NULL,
            size bigint NOT NULL,
            spa boolean NOT NULL,
            description character varying NOT NULL,
            files jsonb NOT NULL
        );

        ALTER TABLE ONLY public.api_token
            ADD CONSTRAINT api_token_pkey PRIMARY KEY (id);

        ALTER TABLE ONLY public.api_token
            ADD CONSTRAINT api_token_secret_hash_key UNIQUE (secret_hash);

        ALTER TABLE ONLY public.cli_login
            ADD CONSTRAINT cli_login_pkey PRIMARY KEY (id);

        ALTER TABLE ONLY public.deployment
            ADD CONSTRAINT deployment_pkey PRIMARY KEY (slug);

        ALTER TABLE ONLY public.discarded_folder
            ADD CONSTRAINT discarded_folder_pkey PRIMARY KEY (folder);

        ALTER TABLE ONLY public.slug_offer
            ADD CONSTRAINT slug_offer_pkey PRIMARY KEY (slug);

        ALTER TABLE ONLY public.users
            ADD CONSTRAINT users_pkey PRIMARY KEY (id);

        ALTER TABLE ONLY public.users
            ADD CONSTRAINT users_provider_subject_key UNIQUE (provider, subject);

        ALTER TABLE ONLY public.version
            ADD CONSTRAINT version_pkey PRIMARY KEY (folder);

        CREATE INDEX ix_api_token_user_id ON public.api_token USING btree (user_id);

        CREATE INDEX ix_cli_login_expires_at ON public.cli_login USING btree (expires_at);

        CREATE INDEX ix_deployment_owner_id ON public.deployment USING btree (owner_id);

        CREATE INDEX ix_deployment_state_locked_until ON public.deployment USING btree (state, locked_until);

        CREATE INDEX ix_discarded_folder_delete_after ON public.discarded_folder USING btree (delete_after);

        CREATE INDEX ix_discarded_folder_owner_id ON public.discarded_folder USING btree (owner_id);

        CREATE INDEX ix_slug_offer_expires_at ON public.slug_offer USING btree (expires_at);

        CREATE INDEX ix_version_slug ON public.version USING btree (slug);

        ALTER TABLE ONLY public.api_token
            ADD CONSTRAINT api_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

        ALTER TABLE ONLY public.cli_login
            ADD CONSTRAINT cli_login_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

        ALTER TABLE ONLY public.discarded_folder
            ADD CONSTRAINT discarded_folder_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

        ALTER TABLE ONLY public.deployment
            ADD CONSTRAINT fk_deployment_owner_id_users FOREIGN KEY (owner_id) REFERENCES public.users(id);

        ALTER TABLE ONLY public.slug_offer
            ADD CONSTRAINT slug_offer_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

        ALTER TABLE ONLY public.version
            ADD CONSTRAINT version_slug_fkey FOREIGN KEY (slug) REFERENCES public.deployment(slug) ON DELETE CASCADE;
    END IF;
END
$$;
