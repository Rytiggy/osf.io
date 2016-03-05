# -*- coding: utf-8 -*-
import pytz
from datetime import datetime
from flask import request
from modularodm import Q

from framework.auth.decorators import must_be_logged_in

from website.addons.base.signals import file_updated
from website.files.models import FileNode
from website.notifications.constants import PROVIDERS
from website.notifications.emails import notify
from website.models import Comment
from website.project.decorators import must_be_contributor_or_public
from website.project.model import Node
from website.project.signals import comment_added
import markdown


@file_updated.connect
def update_comment_root_target_file(self, node, event_type, payload, user=None):
    if event_type == 'addon_file_moved':
        source = payload['source']
        destination = payload['destination']
        source_node = Node.load(source['node']['_id'])
        destination_node = node

        if (source.get('provider') == destination.get('provider') == 'osfstorage') and source_node._id != destination_node._id:
            obj = FileNode.load(source.get('path').strip('/'))
            update_folder_contents([obj], source_node, destination_node)


def update_folder_contents(children, source_node, destination_node):
    for item in children:
        if not item.is_file:
            update_folder_contents(item.children, source_node, destination_node)
        else:
            Comment.update(Q('root_target', 'eq', item._id), data={'node': destination_node})
            # update node record of commented files
            if item._id in source_node.commented_files:
                destination_node.commented_files[item._id] = source_node.commented_files[item._id]
                del source_node.commented_files[item._id]
                source_node.save()
                destination_node.save()

@comment_added.connect
def send_comment_added_notification(comment, auth):
    node = comment.node
    target = comment.target

    context = dict(
        gravatar_url=auth.user.profile_image_url(),
        content=markdown.markdown(comment.content, ['del_ins', 'markdown.extensions.tables', 'markdown.extensions.fenced_code']),
        page_type='file' if comment.page == Comment.FILES else node.project_or_component,
        page_title=comment.root_target.referent.name if comment.page == Comment.FILES else '',
        provider=PROVIDERS[comment.root_target.referent.provider] if comment.page == Comment.FILES else '',
        target_user=target.referent.user if is_reply(target) else None,
        parent_comment=target.referent.content if is_reply(target) else "",
        url=comment.get_comment_page_url()
    )
    time_now = datetime.utcnow().replace(tzinfo=pytz.utc)
    sent_subscribers = notify(
        event="comments",
        user=auth.user,
        node=node,
        timestamp=time_now,
        **context
    )

    if is_reply(target):
        if target.referent.user and target.referent.user not in sent_subscribers:
            notify(
                event='comment_replies',
                user=auth.user,
                node=node,
                timestamp=time_now,
                **context
            )


def is_reply(target):
    return isinstance(target.referent, Comment)


def _update_comments_timestamp(auth, node, page=Comment.OVERVIEW, root_id=None):
    if node.is_contributor(auth.user):
        user_timestamp = auth.user.comments_viewed_timestamp
        node_timestamp = user_timestamp.get(node._id, None)
        if not node_timestamp:
            user_timestamp[node._id] = dict()
        timestamps = auth.user.comments_viewed_timestamp[node._id]

        # update node timestamp
        if page == Comment.OVERVIEW:
            timestamps[Comment.OVERVIEW] = datetime.utcnow()
            auth.user.save()
            return {node._id: auth.user.comments_viewed_timestamp[node._id][Comment.OVERVIEW].isoformat()}

        # set up timestamp dictionary for files page
        if not timestamps.get(page, None):
            timestamps[page] = dict()

        # if updating timestamp on a specific file page
        timestamps[page][root_id] = datetime.utcnow()
        auth.user.save()
        return {node._id: auth.user.comments_viewed_timestamp[node._id][page][root_id].isoformat()}
    else:
        return {}

@must_be_logged_in
@must_be_contributor_or_public
def update_comments_timestamp(auth, node, **kwargs):
    timestamp_info = request.get_json()
    page = timestamp_info.get('page')
    root_id = timestamp_info.get('rootId')
    return _update_comments_timestamp(auth, node, page, root_id)
