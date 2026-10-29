"""add assistant action tokens, conversations, and audit hash chaining

Revision ID: 8d7192a0e4fb
Revises: 7c6081f9e3fa
Create Date: 2026-10-16 10:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d7192a0e4fb'
down_revision: Union[str, None] = '7c6081f9e3fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add speech_rate and history_retention_days to assistant_preferences
    op.add_column(
        'assistant_preferences',
        sa.Column('speech_rate', sa.Float(), nullable=False, server_default='1.0')
    )
    op.add_column(
        'assistant_preferences',
        sa.Column('history_retention_days', sa.Integer(), nullable=False, server_default='30')
    )

    # 2. Add hash chaining columns to assistant_audit_logs
    op.add_column(
        'assistant_audit_logs',
        sa.Column('previous_hash', sa.String(length=64), nullable=True)
    )
    op.add_column(
        'assistant_audit_logs',
        sa.Column('record_hash', sa.String(length=64), nullable=True)
    )

    # 3. Create assistant_action_tokens for single-use expiring confirmation tokens
    op.create_table(
        'assistant_action_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.String(length=100), nullable=False),
        sa.Column('action_id', sa.String(length=100), nullable=False),
        sa.Column('action_type', sa.String(length=100), nullable=False),
        sa.Column('payload_hash', sa.String(length=64), nullable=False),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assistant_action_tokens_token'), 'assistant_action_tokens', ['token'], unique=True)
    op.create_index(op.f('ix_assistant_action_tokens_user_id'), 'assistant_action_tokens', ['user_id'], unique=False)
    op.create_index(op.f('ix_assistant_action_tokens_action_id'), 'assistant_action_tokens', ['action_id'], unique=False)
    op.create_index(op.f('ix_assistant_action_tokens_conversation_id'), 'assistant_action_tokens', ['conversation_id'], unique=False)

    # 4. Create assistant_conversations for user dialogue continuity
    op.create_table(
        'assistant_conversations',
        sa.Column('id', sa.String(length=100), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), server_default='Compliance Inquiry', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assistant_conversations_user_id'), 'assistant_conversations', ['user_id'], unique=False)

    # 5. Create assistant_messages for conversation history tracking
    op.create_table(
        'assistant_messages',
        sa.Column('id', sa.String(length=100), nullable=False),
        sa.Column('conversation_id', sa.String(length=100), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('sender', sa.String(length=20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='success', nullable=False),
        sa.Column('action_type', sa.String(length=100), nullable=True),
        sa.Column('action_payload', sa.Text(), nullable=True),
        sa.Column('confirmation_token', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['assistant_conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assistant_messages_conversation_id'), 'assistant_messages', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_assistant_messages_user_id'), 'assistant_messages', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_assistant_messages_user_id'), table_name='assistant_messages')
    op.drop_index(op.f('ix_assistant_messages_conversation_id'), table_name='assistant_messages')
    op.drop_table('assistant_messages')

    op.drop_index(op.f('ix_assistant_conversations_user_id'), table_name='assistant_conversations')
    op.drop_table('assistant_conversations')

    op.drop_index(op.f('ix_assistant_action_tokens_conversation_id'), table_name='assistant_action_tokens')
    op.drop_index(op.f('ix_assistant_action_tokens_action_id'), table_name='assistant_action_tokens')
    op.drop_index(op.f('ix_assistant_action_tokens_user_id'), table_name='assistant_action_tokens')
    op.drop_index(op.f('ix_assistant_action_tokens_token'), table_name='assistant_action_tokens')
    op.drop_table('assistant_action_tokens')

    op.drop_column('assistant_audit_logs', 'record_hash')
    op.drop_column('assistant_audit_logs', 'previous_hash')
    op.drop_column('assistant_preferences', 'history_retention_days')
    op.drop_column('assistant_preferences', 'speech_rate')
